#!/usr/bin/env python3
"""Reading side of the per-session host pin, for the hooks.

Mirrors scripts/lib/pin.sh and must stay in step with it: both compute the same
path from the uid and the session id, so the guard enforces the same pin the
scripts obey. Let the two derivations drift apart and the scripts act on a host
the guard has already decided not to police -- wrong target, enforcement off.

Hooks receive the session id in the PreToolUse payload and also as
CLAUDE_CODE_SESSION_ID; both were verified identical to what a bin/ process
sees, including inside subagents.
"""
from __future__ import annotations

import os
import subprocess


def canonical_host(name: str) -> str:
    """The machine a name refers to, independent of what it is called locally.

    Mirrors canonical_host() in pin.sh. `ssh -G` reports the effective HostName
    without touching the network (~5 ms), so every alias for one box collapses
    to the same string and a name nothing matches resolves to itself -- which is
    why an unknown target can never collide with a pin by accident.

    Any failure returns the name unchanged. That is the strict direction: an
    unresolved name compares unequal to the pin and is refused, rather than
    waved through because ssh was unavailable.
    """
    if not name:
        return name
    try:
        out = subprocess.run(
            ["ssh", "-G", name],
            capture_output=True, text=True, timeout=5,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return name
    for line in out.splitlines():
        if line.startswith("hostname "):
            return line[len("hostname "):].strip() or name
    return name


def state_dir() -> str:
    return "/tmp/.meyden-%d" % os.getuid()


def pin_dir() -> str:
    return os.path.join(state_dir(), "pins")


def pin_path(session_id: str) -> str:
    return os.path.join(pin_dir(), session_id)


def read_pin(session_id: str) -> dict[str, str]:
    """This session's pin record, or an empty dict.

    A pin belonging to another session is unreachable by construction rather
    than filtered out afterwards -- there is no shared file to read.
    """
    if not session_id:
        return {}
    try:
        with open(pin_path(session_id)) as fh:
            return dict(
                line.split("=", 1)
                for line in fh.read().splitlines()
                if "=" in line
            )
    except OSError:
        return {}


def pinned_host(session_id: str) -> str | None:
    """The alias this session pinned, as the user typed it. For display."""
    return read_pin(session_id).get("host") or None


def pinned_canonical(session_id: str) -> str | None:
    """The pinned machine as the guard enforces it -- compare against this.

    Falls back to resolving the stored alias for a pin file written before
    `canonical` existed. Such a file is still live in /tmp across an upgrade,
    and reading its absence as "matches nothing" would deny every remote command
    for the rest of that session.
    """
    record = read_pin(session_id)
    canonical = record.get("canonical")
    if canonical:
        return canonical
    host = record.get("host")
    return canonical_host(host) if host else None


def clear_pin(session_id: str) -> str | None:
    """Remove this session's pin. Returns the host it named, if any."""
    record = read_pin(session_id)
    if not record:
        return None
    try:
        os.unlink(pin_path(session_id))
    except OSError:
        return None
    return record.get("host") or None


def sweep(max_age_seconds: int) -> int:
    """Delete pin files older than max_age_seconds. Returns how many went.

    SessionEnd removes a pin on the normal path; this only catches sessions
    that died without one -- a crash, a killed terminal, a machine that slept
    through the end of the session.
    """
    import time

    now = time.time()
    removed = 0
    try:
        names = os.listdir(pin_dir())
    except OSError:
        return 0
    for name in names:
        path = os.path.join(pin_dir(), name)
        try:
            if now - os.path.getmtime(path) > max_age_seconds:
                os.unlink(path)
                removed += 1
        except OSError:
            continue
    return removed
