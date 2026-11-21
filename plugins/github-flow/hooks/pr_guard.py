#!/usr/bin/env python3
"""PreToolUse guard for pull-request text.

The github skill is deliberately narrow, so it only fires on part of the work
that actually happens. This hook applies the one rule that must never be
missed, whether or not the skill loaded: it denies PR text carrying a closing
keyword.

Contract: PreToolUse hook input JSON on stdin, decision JSON on stdout, exit 0.
Any parse failure or unexpected shape is a silent no-op -- a guard that blocks
the session when it breaks is worse than no guard.
"""
import json
import re
import sys

# GitHub acts on these in a PR body (and in the merge-commit message): the
# issue closes on merge, so the acceptance test never happens and nobody
# notices until someone reopens it.
CLOSING_RE = re.compile(
    r"\b(clos(?:e|es|ed)|fix(?:es|ed)?|resolv(?:e|es|ed))\b[\s:]*#\d+", re.IGNORECASE
)
PR_WRITE_RE = re.compile(r"\bgh\s+pr\s+(create|edit|merge)\b")


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if not isinstance(payload, dict) or payload.get("tool_name") != "Bash":
        return 0
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return 0
    cmd = tool_input.get("command")
    if not isinstance(cmd, str) or not PR_WRITE_RE.search(cmd):
        return 0
    match = CLOSING_RE.search(cmd)
    if not match:
        return 0
    sys.stdout.write(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": (
                "This pull request text contains %r. GitHub reads that as an action, "
                "not a reference: the issue closes automatically on merge, so the "
                "acceptance test never happens and nobody notices until someone opens "
                "the issue later. Write `Part of #N` instead, or `Bezug: #N` on a "
                "German-language project. An issue is closed only after the user "
                "confirms it works." % match.group(0)
            ),
        }
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
