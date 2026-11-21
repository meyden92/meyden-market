#!/usr/bin/env python3
"""Lifecycle of the per-session host pin.

    session_pin.py start   sweep abandoned pins; restate this session's, if any
    session_pin.py end     release this session's pin

A pin is session state and should end with the session. The alternative (an
expiry window) gets both cases wrong at once: a resumed session keeps its id
and would lose a pin that is still correct, while a session that died leaves one
authoritative for the rest of the window.

Exits 0 whatever happens. A hook that fails the session start because it could
not tidy a temp directory is worse than no hook.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "lib"))
from pin import clear_pin, read_pin, sweep  # noqa: E402

# Only sessions that never reached SessionEnd leave a pin behind, so this is a
# crash sweep, not an expiry policy. Long enough that a live concurrent session
# can never be caught by it.
ABANDONED_AFTER_SECONDS = 3 * 24 * 60 * 60


def emit_context(text):
    sys.stdout.write(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": text,
        }
    }))


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}
    session_id = str((payload or {}).get("session_id") or os.environ.get("CLAUDE_CODE_SESSION_ID") or "")

    if action == "end":
        clear_pin(session_id)
        return 0

    if action == "start":
        sweep(ABANDONED_AFTER_SECONDS)
        record = read_pin(session_id)
        host = record.get("host")
        if host:
            emit_context(
                "▶︎ meyden-ssh: this session is still pinned to '%s' (pinned in %s). "
                "Every meyden-ssh verb and every raw ssh command targets that host "
                "until `meyden-ssh unpin`." % (host, record.get("project", "an unknown project"))
            )
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
