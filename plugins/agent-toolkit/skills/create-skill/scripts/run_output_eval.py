#!/usr/bin/env python3
"""Run output evals for a skill in isolated scratch projects.

Each eval case runs twice: once with the skill installed, once without (or
against a snapshot of the previous version). Every run gets its own throwaway
project directory outside the repo, and Claude is launched headless with
`--setting-sources project` so that only that directory's `.claude/skills/`
is visible.

That flag is what makes the baseline meaningful. Without it, the user's
personal skills in ~/.claude/skills/ follow the run into any working
directory, so a "without skill" arm can still see, and invoke, the skill
under test. Claude Code's own built-in skills (dataviz, simplify, run, ...)
remain visible in both arms; they are constant across arms, so comparisons
stay controlled.

Produces the directory layout that aggregate_benchmark.py and the eval
viewer both expect:

    <workspace>/
      eval-<id>-<slug>/
        eval_metadata.json
        with_skill/run-1/{outputs/, timing.json, transcript.md, result.json}
        without_skill/run-1/{...}
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

SKILL_COPY_IGNORE = shutil.ignore_patterns(
    "__pycache__", "*.pyc", ".git", ".DS_Store", "evals", "*-workspace"
)


def slugify(text: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].strip("-") or "eval"


def build_work_dir(work: Path, skill_src: Path | None, input_files: list[Path]) -> None:
    """Create a throwaway project dir, optionally with the skill installed."""
    work.mkdir(parents=True, exist_ok=True)
    if skill_src is not None:
        name = skill_src.name
        dest = work / ".claude" / "skills" / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(skill_src, dest, ignore=SKILL_COPY_IGNORE)
    for f in input_files:
        if f.is_dir():
            shutil.copytree(f, work / f.name, dirs_exist_ok=True)
        else:
            shutil.copy2(f, work / f.name)


def snapshot_outputs(work: Path, outputs: Path, injected_skill: str | None = None) -> None:
    """Copy everything the run left behind, minus the skill we injected.

    Only the injected skill directory is skipped, not the whole .claude/
    tree. A run that *authors* a skill writes its deliverable into
    .claude/skills/, so dropping .claude/ wholesale discards exactly what
    the eval is measuring and leaves an empty outputs/ that reads like a run
    which produced nothing.
    """
    outputs.mkdir(parents=True, exist_ok=True)
    injected = (work / ".claude" / "skills" / injected_skill) if injected_skill else None

    def ignore(dirpath, names):
        if injected is not None and Path(dirpath) == injected.parent:
            return {n for n in names if n == injected.name}
        return set()

    for item in work.iterdir():
        target = outputs / item.name
        if item.is_dir():
            shutil.copytree(item, target, dirs_exist_ok=True, ignore=ignore)
        else:
            shutil.copy2(item, target)


def run_completed(run_dir: Path) -> bool:
    """True when this run already finished cleanly, per its own timing.json."""
    timing = run_dir / "timing.json"
    if not timing.exists():
        return False
    try:
        return json.loads(timing.read_text()).get("status") == "ok"
    except json.JSONDecodeError:
        return False


def total_tokens(usage: dict) -> int:
    return sum(
        int(usage.get(k, 0) or 0)
        for k in (
            "input_tokens",
            "output_tokens",
            "cache_creation_input_tokens",
            "cache_read_input_tokens",
        )
    )


def run_arm(
    prompt: str,
    run_dir: Path,
    skill_src: Path | None,
    input_files: list[Path],
    model: str | None,
    permission_mode: str,
    timeout: int,
) -> dict:
    """Run one arm of one eval case and persist its artifacts."""
    work = run_dir / "work"
    if work.exists():
        shutil.rmtree(work)
    build_work_dir(work, skill_src, input_files)

    cmd = [
        "claude",
        "-p", prompt,
        "--output-format", "json",
        "--setting-sources", "project",
        "--permission-mode", permission_mode,
    ]
    if model:
        cmd.extend(["--model", model])

    # CLAUDECODE guards against interactive nesting; subprocess use is safe.
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}

    status = "ok"
    payload: dict = {}
    try:
        proc = subprocess.run(
            cmd,
            cwd=work,
            env=env,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        raw = proc.stdout.strip()
        if raw:
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                status = "unparseable-output"
                (run_dir / "stdout.txt").write_text(raw)
        else:
            status = "empty-output"
        if proc.returncode != 0 and status == "ok":
            status = f"exit-{proc.returncode}"
        if proc.stderr.strip():
            (run_dir / "stderr.txt").write_text(proc.stderr)
    except subprocess.TimeoutExpired:
        status = "timeout"

    snapshot_outputs(work, run_dir / "outputs", skill_src.name if skill_src else None)
    shutil.rmtree(work, ignore_errors=True)

    duration_ms = int(payload.get("duration_ms", 0) or 0)
    tokens = total_tokens(payload.get("usage", {}) or {})
    (run_dir / "timing.json").write_text(json.dumps({
        "total_tokens": tokens,
        "duration_ms": duration_ms,
        "total_duration_seconds": round(duration_ms / 1000, 1),
        "num_turns": payload.get("num_turns", 0),
        "total_cost_usd": payload.get("total_cost_usd", 0),
        "status": status,
    }, indent=2))

    if payload:
        (run_dir / "result.json").write_text(json.dumps(payload, indent=2))
    (run_dir / "transcript.md").write_text(
        f"# Prompt\n\n{prompt}\n\n# Final response\n\n{payload.get('result', '(no response captured)')}\n"
    )
    return {"status": status, "tokens": tokens, "duration_ms": duration_ms}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--skill-path", required=True, help="Skill directory under test")
    p.add_argument("--evals", required=True, help="Path to evals.json")
    p.add_argument("--workspace", required=True, help="Iteration dir to write results into")
    p.add_argument("--baseline", default="none",
                   help="'none' for a no-skill baseline (default), or a path to a "
                        "skill snapshot to compare against (arm is named old_skill)")
    p.add_argument("--model", default=None, help="Model id; omit to use the configured default")
    p.add_argument("--permission-mode", default="bypassPermissions",
                   help="Runs are confined to a throwaway dir, so bypassPermissions is the "
                        "default; anything stricter silently denies tools in headless mode "
                        "and understates what the skill can do")
    p.add_argument("--runs-per-arm", type=int, default=1)
    p.add_argument("--timeout", type=int, default=900, help="Per-run timeout in seconds")
    p.add_argument("--workers", type=int, default=4, help="Concurrent runs")
    p.add_argument("--only", nargs="*", default=None, help="Only run these eval ids")
    p.add_argument("--retry-failed", action="store_true",
                   help="Skip runs that already completed cleanly and re-run only the rest. "
                        "A timed-out or crashed run leaves the same empty output as a skill "
                        "that did nothing, so clear these before reading the results.")
    p.add_argument(
        "--arms", nargs="*", default=None,
        choices=["with_skill", "without_skill", "old_skill"],
        help="Only run these arms. Needed when a skill writes to shared external state "
             "(a live tracker, a shared database): running both arms together lets the "
             "first arm's writes become the second arm's starting conditions. Run each "
             "arm into the same workspace with a state reset in between.")
    args = p.parse_args()

    skill_path = Path(args.skill_path).resolve()
    if not (skill_path / "SKILL.md").exists():
        print(f"Error: no SKILL.md at {skill_path}", file=sys.stderr)
        return 1

    evals_path = Path(args.evals).resolve()
    data = json.loads(evals_path.read_text())
    cases = data["evals"] if isinstance(data, dict) else data
    if args.only:
        wanted = {str(x) for x in args.only}
        cases = [c for c in cases if str(c.get("id")) in wanted]
    if not cases:
        print("Error: no eval cases selected", file=sys.stderr)
        return 1

    if args.baseline == "none":
        baseline_src, baseline_arm = None, "without_skill"
    else:
        baseline_src = Path(args.baseline).resolve()
        baseline_arm = "old_skill"
        if not (baseline_src / "SKILL.md").exists():
            print(f"Error: no SKILL.md at baseline {baseline_src}", file=sys.stderr)
            return 1

    workspace = Path(args.workspace).resolve()
    workspace.mkdir(parents=True, exist_ok=True)

    # Manifest so grade_runs.py needs only the workspace path: it reads the
    # evals file back from here to pick up assertions drafted after launch.
    (workspace / "eval_run.json").write_text(json.dumps({
        "skill_name": skill_path.name,
        "skill_path": str(skill_path),
        "evals_path": str(evals_path),
        "model": args.model,
        "baseline_arm": baseline_arm,
        "runs_per_arm": args.runs_per_arm,
    }, indent=2))

    jobs = []
    for case in cases:
        eval_id = case.get("id", 0)
        name = case.get("name") or slugify(case.get("expected_output") or case["prompt"])
        eval_dir = workspace / f"eval-{eval_id}-{name}"
        eval_dir.mkdir(parents=True, exist_ok=True)

        meta = {
            "eval_id": eval_id,
            "eval_name": name,
            "prompt": case["prompt"],
            # evals.json has used both spellings; keep whichever the file provides.
            "assertions": case.get("assertions") or case.get("expectations") or [],
        }
        (eval_dir / "eval_metadata.json").write_text(json.dumps(meta, indent=2))

        # Documented as relative to the skill root; fall back to the evals dir.
        input_files, missing = [], []
        for f in case.get("files", []):
            for base in (skill_path, evals_path.parent):
                candidate = (base / f).resolve()
                if candidate.exists():
                    input_files.append(candidate)
                    break
            else:
                missing.append(f)
        if missing:
            print(f"Warning: eval {eval_id} missing input files: {missing}", file=sys.stderr)

        for arm, src in (("with_skill", skill_path), (baseline_arm, baseline_src)):
            if args.arms and arm not in args.arms:
                continue
            for run_idx in range(1, args.runs_per_arm + 1):
                run_dir = eval_dir / arm / f"run-{run_idx}"
                if args.retry_failed and run_completed(run_dir):
                    continue
                run_dir.mkdir(parents=True, exist_ok=True)
                # Viewer looks for metadata in the run dir or its parent.
                (run_dir / "eval_metadata.json").write_text(json.dumps(meta, indent=2))
                jobs.append((case["prompt"], run_dir, src, input_files, f"eval-{eval_id} {arm} run-{run_idx}"))

    if not jobs:
        print("Nothing to run: every selected run already completed cleanly.", file=sys.stderr)
        return 0

    print(f"Running {len(jobs)} isolated runs ({args.workers} at a time)...", file=sys.stderr)
    failures = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(run_arm, prompt, run_dir, src, files,
                        args.model, args.permission_mode, args.timeout): label
            for prompt, run_dir, src, files, label in jobs
        }
        for future in as_completed(futures):
            label = futures[future]
            try:
                res = future.result()
            except Exception as e:  # noqa: BLE001 - report and continue
                failures += 1
                print(f"  [ERROR] {label}: {e}", file=sys.stderr)
                continue
            if res["status"] != "ok":
                failures += 1
            marker = "ok" if res["status"] == "ok" else res["status"].upper()
            print(f"  [{marker}] {label}: {res['duration_ms'] / 1000:.1f}s, "
                  f"{res['tokens']} tokens", file=sys.stderr)

    print(f"\nDone. Results in {workspace}", file=sys.stderr)
    if failures:
        print(f"{failures} run(s) did not complete cleanly; check timing.json/stderr.txt.",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
