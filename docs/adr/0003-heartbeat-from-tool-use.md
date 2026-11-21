# Time tracking beats from tool use, not only from the end of a turn

Heartbeats are what make booked time *work* time: `work_buckets` counts a minute only if it falls within the idle grace (15 minutes) of a beat. Until now the only beat came from the `Stop` hook, which fires when a turn *ends*. An agent turn longer than the grace therefore had its tail discarded as though nobody was working — and the longer the turn, the more time vanished. `attribute.py` (already wired to `PostToolUse` for `Edit|Write|MultiEdit|NotebookEdit|Read|Bash`) now also records a beat, throttled to once per 60 seconds via the heartbeat file's mtime.

The bias was one-directional and invisible: it only ever under-counted, and it hit hardest exactly where the tool is most used — long autonomous stretches. It surfaced when a session booked 2h 33m against 4h 47m of wall clock and the gaps could not be explained by breaks alone.

## Considered Options

- **Beat from more lifecycle hooks** (`PreToolUse`, `Notification`) — rejected: same blind spot, since none of them fire during a long turn either.
- **Drop the idle trimming and book wall clock** — rejected: it is the feature that stops a session left open overnight from booking sixteen hours.
- **Shorten the idle grace** — rejected: it would make the under-count *worse*, trimming long turns sooner.
- **A background process ticking while a turn runs** — rejected: a daemon per session is far more machinery than a stat and an append.

## Consequences

The `.hb` sidecar filename is now duplicated in `attribute.py` rather than taken from `store._sidecar`. That is deliberate: the hook runs after every file read and every shell command, and importing `store` merely to learn a filename would undo the cheapness it is built around. `store` is imported only when a beat is actually due — at most once a minute. The cost added to an untracked project is one `os.path.exists`; to a tracked one, two stats.

If `store`'s sidecar naming ever changes, this file must change with it. Nothing enforces that.
