#!/usr/bin/env python3
"""Grade, aggregate, and review a finished output-eval workspace.

The whole post-run pipeline in one command:

  1. refresh each run's assertions from evals.json
  2. grade every ungraded run with an isolated headless grader, in parallel
  3. normalize and validate the grading.json each grader wrote
  4. aggregate into benchmark.json / benchmark.md
  5. open the review viewer

Step 1 is why assertions can be drafted *after* the runs are launched: the
grader reads them from evals.json at grading time, so a late assertion costs
nothing instead of a full re-run of the eval set.

Step 3 exists because the viewer and the aggregator both key on the exact
field names `text` / `passed` / `evidence`. A grader that writes `assertion`
or `reason` instead produces a benchmark that looks fine and shows nothing,
so the names are normalized here rather than trusted.

Usage:
    python3 grade_runs.py <workspace>/iteration-1
    python3 grade_runs.py <workspace>/iteration-2 --previous-workspace <workspace>/iteration-1
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
GRADER_PROMPT = SKILL_DIR / "prompts" / "grader.md"
AGGREGATE = SKILL_DIR / "scripts" / "aggregate_benchmark.py"
VIEWER = SKILL_DIR / "eval-viewer" / "generate_review.py"

# Graders paraphrase field names. Map the plausible variants onto the three
# the viewer and aggregator actually read.
TEXT_KEYS = ("text", "expectation", "assertion", "description", "name", "criterion")
PASSED_KEYS = ("passed", "pass", "passes", "result", "success", "ok", "verdict")
EVIDENCE_KEYS = ("evidence", "reason", "justification", "notes", "detail", "explanation")

TRUTHY = {"true", "pass", "passed", "yes", "y", "1", "ok", "success"}
FALSEY = {"false", "fail", "failed", "no", "n", "0", "error"}


def first_key(obj: dict, keys: tuple) -> object:
    for k in keys:
        if k in obj and obj[k] not in (None, ""):
            return obj[k]
    return None


def as_bool(value: object) -> bool | None:
    """Coerce a grader's verdict to a bool; None when it isn't interpretable."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        v = value.strip().lower()
        if v in TRUTHY:
            return True
        if v in FALSEY:
            return False
    return None


def normalize_grading(raw: dict) -> tuple[dict, list[str]]:
    """Coerce a grader's output into the shape downstream tools require.

    Returns the normalized dict plus a list of problems worth reporting.
    """
    problems: list[str] = []
    expectations = raw.get("expectations")
    if not isinstance(expectations, list):
        # Some graders nest the list, or name it after the input field.
        for alt in ("assertions", "results", "grades"):
            if isinstance(raw.get(alt), list):
                expectations = raw[alt]
                break
        else:
            expectations = []
            problems.append("no expectations array found")

    clean = []
    for i, exp in enumerate(expectations):
        if not isinstance(exp, dict):
            problems.append(f"expectation {i} is not an object")
            continue
        text = first_key(exp, TEXT_KEYS)
        passed = as_bool(first_key(exp, PASSED_KEYS))
        evidence = first_key(exp, EVIDENCE_KEYS)
        if text is None:
            problems.append(f"expectation {i} has no recognizable text field")
            continue
        if passed is None:
            problems.append(f"expectation {i} ('{str(text)[:40]}') has no readable verdict; recording as failed")
            passed = False
        clean.append({
            "text": str(text),
            "passed": passed,
            "evidence": str(evidence) if evidence is not None else "",
        })

    passed_n = sum(1 for e in clean if e["passed"])
    total = len(clean)
    out = {
        "expectations": clean,
        "summary": {
            "passed": passed_n,
            "failed": total - passed_n,
            "total": total,
            # Recomputed rather than trusted: graders get the arithmetic wrong.
            "pass_rate": round(passed_n / total, 4) if total else 0.0,
        },
    }
    for extra in ("claims", "eval_feedback"):
        if extra in raw:
            out[extra] = raw[extra]
    return out, problems


def load_assertions(evals_path: Path) -> dict:
    """Map eval id -> assertions, so late-added assertions reach the grader."""
    data = json.loads(evals_path.read_text())
    cases = data["evals"] if isinstance(data, dict) else data
    out = {}
    for case in cases:
        out[str(case.get("id"))] = case.get("assertions") or case.get("expectations") or []
    return out


def refresh_metadata(workspace: Path, by_id: dict) -> int:
    """Rewrite assertions into every eval_metadata.json under the workspace."""
    touched = 0
    for meta_path in workspace.glob("eval-*/**/eval_metadata.json"):
        try:
            meta = json.loads(meta_path.read_text())
        except json.JSONDecodeError:
            continue
        key = str(meta.get("eval_id"))
        if key in by_id and meta.get("assertions") != by_id[key]:
            meta["assertions"] = by_id[key]
            meta_path.write_text(json.dumps(meta, indent=2))
            touched += 1
    return touched


def run_metadata(run_dir: Path) -> dict:
    for candidate in (run_dir / "eval_metadata.json", run_dir.parent.parent / "eval_metadata.json"):
        if candidate.exists():
            try:
                return json.loads(candidate.read_text())
            except json.JSONDecodeError:
                pass
    return {}


def already_graded(run_dir: Path) -> bool:
    path = run_dir / "grading.json"
    if not path.exists():
        return False
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        return False
    return isinstance(data.get("expectations"), list)


def build_prompt(base: str, meta: dict) -> str:
    assertions = meta.get("assertions", [])
    numbered = "\n".join(f"{i}. {a}" for i, a in enumerate(assertions, 1))
    return f"""{base}

---

# This run

You are grading one run, in your current working directory. It contains:

- `transcript.md`: the prompt given to the agent and its final response
- `outputs/`: every file the run left behind
- `timing.json`: wall-clock, token, and status data for the run

The eval prompt was:

{meta.get('prompt', '(unknown)')}

Grade exactly these {len(assertions)} expectations, in this order:

{numbered}

Read the transcript AND inspect the output files themselves: an assertion
about file contents is not satisfied by the transcript claiming the file was
written. Where an assertion is checkable programmatically, check it with a
command rather than by eye.

Write your verdict to `grading.json` in the current directory. Every entry in
`expectations` must use exactly the keys `text`, `passed`, `evidence`.
Output nothing else; the file is the deliverable.
"""


def grade_one(run_dir: Path, base_prompt: str, model: str | None, timeout: int) -> dict:
    meta = run_metadata(run_dir)
    assertions = meta.get("assertions", [])
    if not assertions:
        return {"run": run_dir, "status": "skipped-no-assertions"}

    cmd = [
        "claude",
        "-p", build_prompt(base_prompt, meta),
        "--output-format", "json",
        "--setting-sources", "project",
        "--permission-mode", "bypassPermissions",
    ]
    if model:
        cmd.extend(["--model", model])

    # CLAUDECODE guards against interactive nesting; subprocess use is safe.
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}

    try:
        proc = subprocess.run(
            cmd, cwd=run_dir, env=env, stdin=subprocess.DEVNULL,
            capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {"run": run_dir, "status": "timeout"}

    grading_path = run_dir / "grading.json"
    if not grading_path.exists():
        if proc.stderr.strip():
            (run_dir / "grader_stderr.txt").write_text(proc.stderr)
        return {"run": run_dir, "status": "no-grading-file"}

    try:
        raw = json.loads(grading_path.read_text())
    except json.JSONDecodeError as e:
        return {"run": run_dir, "status": f"unparseable-grading ({e})"}

    clean, problems = normalize_grading(raw)
    grading_path.write_text(json.dumps(clean, indent=2))
    return {
        "run": run_dir,
        "status": "ok",
        "problems": problems,
        "pass_rate": clean["summary"]["pass_rate"],
        "total": clean["summary"]["total"],
    }


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("workspace", help="Iteration directory produced by run_output_eval.py")
    p.add_argument("--evals", default=None,
                   help="Path to evals.json (default: read from the workspace manifest)")
    p.add_argument("--skill-name", default=None, help="Label for the benchmark")
    p.add_argument("--model", default=None, help="Model for the grader")
    p.add_argument("--regrade", action="store_true",
                   help="Re-grade runs that already have a grading.json")
    p.add_argument("--no-view", action="store_true", help="Skip launching the viewer")
    p.add_argument("--static", default=None,
                   help="Write a standalone HTML file instead of serving (headless environments)")
    p.add_argument("--previous-workspace", default=None,
                   help="Previous iteration, shown side by side in the viewer")
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--timeout", type=int, default=600, help="Per-grader timeout in seconds")
    args = p.parse_args()

    workspace = Path(args.workspace).resolve()
    if not workspace.is_dir():
        print(f"Error: no such workspace {workspace}", file=sys.stderr)
        return 1
    if shutil.which("claude") is None:
        print("Error: the `claude` CLI is not on PATH", file=sys.stderr)
        return 1

    manifest = {}
    manifest_path = workspace / "eval_run.json"
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
        except json.JSONDecodeError:
            pass

    evals_path = Path(args.evals or manifest.get("evals_path", "")).expanduser()
    if evals_path.is_file():
        try:
            touched = refresh_metadata(workspace, load_assertions(evals_path))
            print(f"Refreshed assertions in {touched} metadata file(s) from {evals_path}",
                  file=sys.stderr)
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Warning: could not read assertions from {evals_path}: {e}", file=sys.stderr)
    else:
        print("Note: no evals.json resolved, so grading against whatever assertions "
              "the run metadata already holds.", file=sys.stderr)

    runs = sorted(workspace.glob("eval-*/*/run-*"))
    if not runs:
        print(f"Error: no run directories under {workspace}", file=sys.stderr)
        return 1

    pending = [r for r in runs if args.regrade or not already_graded(r)]
    skipped = len(runs) - len(pending)
    if skipped:
        print(f"{skipped} run(s) already graded; pass --regrade to redo them.", file=sys.stderr)

    base_prompt = GRADER_PROMPT.read_text()
    results = []
    if pending:
        print(f"Grading {len(pending)} run(s), {args.workers} at a time...", file=sys.stderr)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {
                pool.submit(grade_one, r, base_prompt, args.model, args.timeout): r
                for r in pending
            }
            for future in as_completed(futures):
                run = futures[future]
                label = run.relative_to(workspace)
                try:
                    res = future.result()
                except Exception as e:  # noqa: BLE001 - report and keep going
                    res = {"run": run, "status": f"error ({e})"}
                results.append(res)
                if res["status"] == "ok":
                    print(f"  [ok] {label}: {res['pass_rate']:.0%} of {res['total']}",
                          file=sys.stderr)
                    for problem in res.get("problems", []):
                        print(f"       ! {problem}", file=sys.stderr)
                else:
                    print(f"  [{res['status'].upper()}] {label}", file=sys.stderr)

    bad = [r for r in results if r["status"] not in ("ok", "skipped-no-assertions")]
    no_assertions = [r for r in results if r["status"] == "skipped-no-assertions"]
    if no_assertions:
        print(f"\n{len(no_assertions)} run(s) had no assertions and were left ungraded; "
              f"add them to evals.json and re-run this command.", file=sys.stderr)

    graded_any = any(already_graded(r) for r in runs)
    if graded_any:
        print("\nAggregating...", file=sys.stderr)
        cmd = [sys.executable, str(AGGREGATE), str(workspace)]
        name = args.skill_name or manifest.get("skill_name")
        if name:
            cmd.extend(["--skill-name", name])
        subprocess.run(cmd, check=False)
    else:
        print("\nNothing graded, so skipping the benchmark. The viewer still shows the "
              "outputs for qualitative review.", file=sys.stderr)

    if not args.no_view:
        cmd = [sys.executable, str(VIEWER), str(workspace)]
        name = args.skill_name or manifest.get("skill_name")
        if name:
            cmd.extend(["--skill-name", name])
        benchmark = workspace / "benchmark.json"
        if benchmark.exists():
            cmd.extend(["--benchmark", str(benchmark)])
        if args.previous_workspace:
            cmd.extend(["--previous-workspace", args.previous_workspace])
        if args.static:
            cmd.extend(["--static", args.static])
            subprocess.run(cmd, check=False)
        else:
            proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"\nViewer running as PID {proc.pid}; stop it with: kill {proc.pid}",
                  file=sys.stderr)

    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
