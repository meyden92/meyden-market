#!/usr/bin/env python3
"""PreToolUse guard for remote shell commands.

The ssh skill is deliberately narrow, so it only fires on part of
the work that actually happens; when it does not fire, its guardrails are
absent. This hook applies the ones that must never be missed, whether or not a
skill loaded:

  deny  -- commands that would hang the session with nobody to answer them,
           StrictHostKeyChecking=no (which turns a real warning into silence),
           and work aimed at a host other than the one this session is pinned to
  ask   -- destructive operations, routed to a confirmation prompt

Everything else falls through to the normal permission flow. This never returns
"allow": a permission rule cannot scope what runs on the far end of an ssh
connection, so the standard prompt stays as an independent second layer.

Contract: PreToolUse hook input JSON on stdin, decision JSON on stdout, exit 0.
Any parse failure or unexpected shape is a silent no-op -- a guard that blocks
the session when it breaks is worse than no guard.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "lib"))
from pin import canonical_host, pinned_canonical, pinned_host  # noqa: E402

# A remote-shell invocation at a command position: start of line, after a
# separator, or after sudo/env/nohup/time. Matching bare \bssh\b would fire on
# `grep ssh notes.txt`, so anchor to where a command can actually begin.
CMD_START = r"(?:^|[\n;(]|&&|\|\||[|&])\s*(?:(?:sudo|env|nohup|time)\s+[^\s]*\s*)*"
# Lookahead for whitespace/end rather than \b: \b matches inside `(ssh|scp)`, so a
# command merely containing that alternation as text would trip the guard.
REMOTE_RE = re.compile(CMD_START + r"(ssh|scp|sftp|rsync)(?=\s|$)")

# The ssh verbs wrap ssh, so `meyden-ssh logs nginx` reaches a remote host without
# the word ssh appearing at a command position. Without this, routing through
# the plugin would bypass every rule below -- which is backwards.
MEYDEN_SSH_RE = re.compile(CMD_START + r"meyden-ssh\s+(\w[\w-]*)")

# ssh options that consume the following token as their value.
OPTS_WITH_VALUE = set("-o -i -p -F -l -J -b -c -D -e -L -R -S -W -Q -m -O -B -E -I -w".split())

# Would block forever with no TTY to interrupt it.
HANGS = [
    (r"\btail\b[^|;]*\s-{1,2}(f\b|follow)", "`tail -f` never returns"),
    (r"\bjournalctl\b[^|;]*\s-{1,2}(f\b|follow)", "`journalctl -f` never returns"),
    (r"\bhtop\b", "`htop` is a full-screen program and cannot run without a TTY"),
    (r"\bwatch\s", "`watch` repeats until interrupted"),
    (r"\b(less|more)\s", "a pager waits for keystrokes that never arrive"),
    (r"\b(vim?|nano|emacs|vi)\s", "an editor waits for keystrokes that never arrive"),
]
BATCH_FIXES = {
    "tail": "use `tail -n <count>`, or wrap it in `timeout 20 ...`",
    "journalctl": "use `meyden-ssh logs <unit> <lines>`, which is bounded by construction",
    "htop": "use `ps aux --sort=-%cpu | head -20`",
    "watch": "run the command once, or bound it with `timeout`",
    "less": "use `cat`, or `head`/`tail -n <count>`",
    "more": "use `cat`, or `head`/`tail -n <count>`",
    "vim": "read with `cat` and write the new content through a quoted heredoc",
    "vi": "read with `cat` and write the new content through a quoted heredoc",
    "nano": "read with `cat` and write the new content through a quoted heredoc",
    "emacs": "read with `cat` and write the new content through a quoted heredoc",
}

# Irreversible or service-affecting on a live host -> confirm first.
DESTRUCTIVE = [
    (r"\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*r[a-zA-Z]*f|\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*f[a-zA-Z]*r", "recursive force delete"),
    (r"--delete(-during|-after|-before|-excluded)?\b", "rsync --delete removes files on the remote"),
    (r"\bmkfs(\.\w+)?\b", "formats a filesystem"),
    (r"\b(shutdown|reboot|halt|poweroff)\b", "takes the host down"),
    (r"\bDROP\s+(TABLE|DATABASE|SCHEMA)\b", "drops a database object"),
    (r"\bTRUNCATE\s+TABLE\b", "empties a table"),
    (r">>?\s*/etc/", "writes into /etc"),
    (r"\bdd\s+[^|;]*\bof=", "dd writes raw blocks"),
    (r"--force\b", "--force overrides a safety check"),
    (r"\bsystemctl\s+(disable|mask)\b", "disables a service"),
    (r"\buserdel\b|\bgroupdel\b", "removes an account"),
]

NO_OP = 0


def emit(obj):
    sys.stdout.write(json.dumps(obj))


def decision(kind, reason):
    emit({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": kind,
            "permissionDecisionReason": reason,
        }
    })


def extract_targets(cmd):
    """Hosts this command appears to act on.

    Returns an empty set when the shape isn't recognised. Only a confidently
    extracted target is ever used to block: guessing wrong here would deny
    legitimate work, and the scripts enforce the pin themselves as a backstop.
    """
    import shlex
    try:
        tokens = shlex.split(cmd)
    except ValueError:
        return set()

    targets = set()
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        base = tok.rsplit("/", 1)[-1]
        if tok == "--host":
            if i + 1 < len(tokens):
                targets.add(tokens[i + 1].split("@")[-1])
            i += 2
            continue
        # `meyden-ssh logs nginx` -- here `ssh` is a domain and the token after it
        # is a verb, not a hostname. Read it as a hostname and every legitimate
        # verb call on a pinned session is denied as a stray target. Only
        # --host names a target in this form.
        if base == "meyden" and i + 1 < len(tokens) and tokens[i + 1] == "ssh":
            i += 3
            continue
        if base in ("ssh", "sftp"):
            j = i + 1
            while j < len(tokens):
                t = tokens[j]
                if t in OPTS_WITH_VALUE:
                    j += 2
                    continue
                if t.startswith("-"):
                    j += 1
                    continue
                targets.add(t.split("@")[-1])
                break
            i = j + 1
            continue
        if base in ("scp", "rsync"):
            for t in tokens[i + 1:]:
                if t.startswith("-"):
                    continue
                # host:path -- exclude windows-ish drive letters and plain paths
                if ":" in t and not t.startswith("/") and not t.startswith("."):
                    targets.add(t.split(":", 1)[0].split("@")[-1])
            i += 1
            continue
        i += 1
    return {t for t in targets if t and not t.startswith("-")}


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return NO_OP
    if not isinstance(payload, dict) or payload.get("tool_name") != "Bash":
        return NO_OP

    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return NO_OP
    cmd = tool_input.get("command")
    if not isinstance(cmd, str) or not cmd.strip():
        return NO_OP

    match = REMOTE_RE.search(cmd)
    via_meyden = MEYDEN_SSH_RE.search(cmd)
    if not match and not via_meyden:
        return NO_OP
    binary = match.group(1) if match else "meyden-ssh"

    # A pinned session may touch exactly one machine. Enforced here so it holds
    # for raw ssh too, not only for the verbs that check it themselves. The
    # session id comes from the payload and matches what the scripts read from
    # CLAUDE_CODE_SESSION_ID, so both layers resolve the same pin file.
    session_id = str(payload.get("session_id") or "")
    pinned = pinned_host(session_id)
    if pinned:
        # Both sides go through `ssh -G` first, so the pin is enforced on the
        # machine rather than on the spelling. Comparing the names as written
        # made enforcement depend on local naming: a skill that hardcodes
        # app1.example.com was denied on a session pinned to app1, the same
        # box under the name that colleague's ~/.ssh/config gives it.
        pinned_target = pinned_canonical(session_id)
        strays = {
            t for t in extract_targets(cmd)
            if canonical_host(t) != pinned_target
        }
        if strays:
            decision(
                "deny",
                "‼️ This session is pinned to '%s' but the command targets %s. "
                "The pin exists so one session cannot act on two machines by "
                "accident. If the other host is genuinely wanted, release it "
                "first: meyden-ssh unpin"
                % (pinned, ", ".join("'%s'" % s for s in sorted(strays))),
            )
            return 0

    if re.search(r"StrictHostKeyChecking\s*=\s*no", cmd):
        decision(
            "deny",
            "StrictHostKeyChecking=no silences host-key verification instead of "
            "resolving it. An unknown key on a first connection should be shown to "
            "the user with its fingerprint; a CHANGED key means the host was "
            "rebuilt, moved, or is being intercepted, and is theirs to judge. "
            "Drop the flag and report what ssh actually says.",
        )
        return 0

    # `timeout N ...` bounds an otherwise unbounded command, so it is allowed.
    bounded = re.search(r"\btimeout\s+\d", cmd)
    for pattern, why in HANGS:
        hit = re.search(pattern, cmd, re.IGNORECASE)
        if hit and not bounded:
            prog = hit.group(0).strip().split()[0].lstrip("-")
            fix = BATCH_FIXES.get(prog, "use the command's batch form, or bound it with `timeout`")
            decision(
                "deny",
                f"This would hang the session: {why}. With no TTY the call blocks "
                f"until the tool times out and returns no output at all -- not even "
                f"the reason. Instead, {fix}.",
            )
            return 0

    hits = [why for pattern, why in DESTRUCTIVE if re.search(pattern, cmd, re.IGNORECASE)]
    if hits:
        decision(
            "ask",
            "‼️ Destructive on a live remote host (" + "; ".join(hits) + "). Confirm the "
            "exact command and the target host before this runs. If it is a delete, "
            "list what the pattern matches first.",
        )
        return 0

    # Fall through to the normal permission prompt, but flag a missing BatchMode:
    # without it a password or passphrase prompt hangs instead of failing fast.
    if binary in ("ssh", "scp", "sftp") and "BatchMode" not in cmd:
        emit({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "additionalContext": (
                    "meyden remote_guard: this command has no `-o BatchMode=yes -o "
                    "ConnectTimeout=10`. Without BatchMode, a password or passphrase "
                    "prompt hangs until the tool times out instead of failing with a "
                    "readable error. Add both options, or use `meyden-ssh run`, which "
                    "applies them for you."
                ),
            }
        })
    return 0


if __name__ == "__main__":
    sys.exit(main())
