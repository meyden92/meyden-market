#!/usr/bin/env python3
"""How this developer has actually been running Claude Code on this repo.

Read-only, and deliberately numbers-only: it is run by a sub-agent so the raw
transcripts never enter the main context. The judgement about what the numbers
mean belongs to the caller.

Two independent views:

    session_stats.py --models   which model and effort level past sessions ran at
    session_stats.py --hygiene  how sessions are sized and whether they are reset

Usage:
    session_stats.py (--models | --hygiene) [--repo DIR] [--days N] [--json]
"""

import argparse
import json
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path

HOME = Path.home()
PROJECTS_DIR = HOME / ".claude" / "projects"
HISTORY = HOME / ".claude" / "history.jsonl"

# Mirrors the bar the preflight gate enforces, so both speak about the same line.
GOOD_FAMILIES = ("opus", "fable")
GOOD_EFFORTS = ("high", "xhigh", "max")

# A session past either of these has almost certainly outlived the task it
# started on. Hours matters more than prompts: one prompt can drive an hour of
# agent work, so a low prompt count says nothing about how full the context got.
LONG_SESSION_PROMPTS = 20
LONG_SESSION_HOURS = 3

# Reaching for these in one session means planning and building share a context.
PLANNING = {"spec-planning", "to-spec", "to-tickets", "interview", "wayfinder",
            "domain-modeling", "research", "prototype"}
BUILDING = {"implement", "tdd", "code-review"}
BOOKENDS = {"session-start", "session-end", "handoff"}


def read_jsonl(path, limit=None):
    try:
        with open(path) as f:
            for i, line in enumerate(f):
                if limit is not None and i >= limit:
                    return
                try:
                    yield json.loads(line)
                except ValueError:
                    continue
    except OSError:
        return


def cutoff_ms(days):
    return (time.time() - days * 86400) * 1000


def meets_bar(model, effort):
    name = (model or "").removeprefix("claude-").split("-")[0]
    return name in GOOD_FAMILIES and (effort or "").lower() in GOOD_EFFORTS


# --------------------------------------------------------------------------
# --models: read from the transcripts, which record model and effort per turn
# --------------------------------------------------------------------------

def transcripts(repo, days):
    """Session files whose recorded cwd is this repo, newest first."""
    cutoff = cutoff_ms(days) / 1000
    found = []
    for path in PROJECTS_DIR.glob("*/*.jsonl"):
        try:
            if path.stat().st_mtime < cutoff:
                continue
        except OSError:
            continue
        # cwd is stamped on nearly every record; the head of the file is enough.
        cwd = next((r.get("cwd") for r in read_jsonl(path, limit=20) if r.get("cwd")), None)
        if cwd and Path(cwd) == repo:
            found.append(path)
    return sorted(found, key=lambda p: p.stat().st_mtime, reverse=True)


def models_report(repo, days):
    sessions = []
    for path in transcripts(repo, days):
        turns = Counter()
        newest = 0
        for rec in read_jsonl(path):
            if rec.get("type") != "assistant":
                continue
            model = (rec.get("message") or {}).get("model") or "unknown"
            turns[(model, (rec.get("effort") or "unknown").lower())] += 1
        if not turns:
            continue
        newest = path.stat().st_mtime
        (model, effort), _ = turns.most_common(1)[0]
        sessions.append({
            "session": path.stem[:8],
            "date": time.strftime("%Y-%m-%d", time.localtime(newest)),
            "model": model,
            "effort": effort,
            "turns": sum(turns.values()),
            "mixed": len(turns) > 1,
            "meets_bar": meets_bar(model, effort),
        })

    turns_by_model = Counter()
    turns_by_effort = Counter()
    for s in sessions:
        turns_by_model[s["model"]] += s["turns"]
        turns_by_effort[s["effort"]] += s["turns"]

    return {
        "window_days": days,
        "sessions": sessions,
        "sessions_meeting_bar": sum(1 for s in sessions if s["meets_bar"]),
        "session_count": len(sessions),
        "turns_by_model": dict(turns_by_model.most_common()),
        "turns_by_effort": dict(turns_by_effort.most_common()),
    }


# --------------------------------------------------------------------------
# --hygiene: read from the prompt history, which spans sessions
# --------------------------------------------------------------------------

def command_of(display):
    """The skill name behind a typed slash command, namespace stripped."""
    text = (display or "").strip()
    if not text.startswith("/"):
        return None
    return text[1:].split()[0].split(":")[-1] if text[1:].split() else None


def hygiene_report(repo, days):
    cutoff = cutoff_ms(days)
    per_session = defaultdict(list)
    for row in read_jsonl(HISTORY):
        if row.get("project") != str(repo) or (row.get("timestamp") or 0) < cutoff:
            continue
        per_session[row.get("sessionId")].append(row)

    sessions, clears = [], 0
    mixed, bookended = 0, 0
    for sid, rows in per_session.items():
        rows.sort(key=lambda r: r.get("timestamp") or 0)
        commands = {c for c in (command_of(r.get("display")) for r in rows) if c}
        clears += sum(1 for r in rows if command_of(r.get("display")) == "clear")
        span = ((rows[-1]["timestamp"] - rows[0]["timestamp"]) / 3_600_000) if len(rows) > 1 else 0.0
        if commands & PLANNING and commands & BUILDING:
            mixed += 1
        if commands & BOOKENDS:
            bookended += 1
        sessions.append({
            "session": (sid or "?")[:8],
            "date": time.strftime("%Y-%m-%d", time.localtime(rows[0]["timestamp"] / 1000)),
            "prompts": len(rows),
            "hours": round(span, 1),
            "commands": sorted(commands),
        })

    sessions.sort(key=lambda s: s["date"], reverse=True)
    counts = [s["prompts"] for s in sessions] or [0]
    long_running = [s for s in sessions
                    if s["prompts"] >= LONG_SESSION_PROMPTS or s["hours"] >= LONG_SESSION_HOURS]
    return {
        "window_days": days,
        "session_count": len(sessions),
        "prompt_count": sum(counts),
        "prompts_median": round(statistics.median(counts), 1),
        "prompts_max": max(counts),
        "hours_max": max((s["hours"] for s in sessions), default=0.0),
        "clear_count": clears,
        "long_sessions": len(long_running),
        "long_session_ids": [s["session"] for s in long_running],
        "long_session_threshold": f">= {LONG_SESSION_PROMPTS} prompts or >= {LONG_SESSION_HOURS}h",
        "sessions_mixing_planning_and_building": mixed,
        "sessions_using_bookends": bookended,
        "sessions": sessions,
    }


# --------------------------------------------------------------------------

def print_models(r):
    print(f"MODELS  (last {r['window_days']} days, {r['session_count']} session(s) in this repo)")
    if not r["session_count"]:
        print("  no sessions recorded: nothing to judge")
        return
    print(f"  meeting the bar (opus/fable 5 at high+): "
          f"{r['sessions_meeting_bar']}/{r['session_count']}")
    print("  assistant turns by model:  "
          + ", ".join(f"{k} {v}" for k, v in r["turns_by_model"].items()))
    print("  assistant turns by effort: "
          + ", ".join(f"{k} {v}" for k, v in r["turns_by_effort"].items()))
    print("  per session:")
    for s in r["sessions"]:
        flag = "ok " if s["meets_bar"] else "BELOW"
        mixed = "  (switched mid-session)" if s["mixed"] else ""
        print(f"    {s['date']}  {s['session']}  {s['model']} / {s['effort']} effort  "
              f"{s['turns']} turns  [{flag}]{mixed}")


def print_hygiene(r):
    print(f"HYGIENE  (last {r['window_days']} days, {r['session_count']} session(s) in this repo)")
    if not r["session_count"]:
        print("  no prompts recorded: nothing to judge")
        return
    print(f"  prompts: {r['prompt_count']} total, median {r['prompts_median']} per session, "
          f"max {r['prompts_max']}; longest session {r['hours_max']}h")
    print(f"  /clear used: {r['clear_count']} time(s)")
    print(f"  long-running sessions ({r['long_session_threshold']}): {r['long_sessions']}"
          + (f" ({', '.join(r['long_session_ids'])})" if r["long_session_ids"] else ""))
    print(f"  sessions mixing planning and building commands: "
          f"{r['sessions_mixing_planning_and_building']}")
    print(f"  sessions using session-start/session-end/handoff: {r['sessions_using_bookends']}")
    print("  per session:")
    for s in r["sessions"]:
        cmds = ", ".join(s["commands"]) if s["commands"] else "no slash commands"
        print(f"    {s['date']}  {s['session']}  {s['prompts']:>3} prompts  "
              f"{s['hours']:>4}h  {cmds}")


def main():
    ap = argparse.ArgumentParser()
    view = ap.add_mutually_exclusive_group(required=True)
    view.add_argument("--models", action="store_true")
    view.add_argument("--hygiene", action="store_true")
    ap.add_argument("--repo", default=".")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    report = models_report(repo, args.days) if args.models else hygiene_report(repo, args.days)

    if args.json:
        print(json.dumps(report, indent=2))
    elif args.models:
        print_models(report)
    else:
        print_hygiene(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
