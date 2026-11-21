# Usage Band

A mod that draws a band above the prompt:

```
◔ 14% 5h · resets 1h7m    ◕ 83% 7d · resets 3h47m    ◑ 26% ctx 183k / 700k · +12k last turn · cache 98%
Opus 5.5 · effort high · session 32m · $1.23
```

- **Rate limits**: one segment per window the API reports (`five_hour`, `seven_day`, a gateway's
  `spend_limit`), with percent used and time to reset. The ring turns amber at 50% and red at 90%.
  The windows exist only when signed in with a Claude subscription; with an API key they are
  hidden.
- **Context**: how full the context window is, in percent and tokens. Amber from 60%, red from
  80%. Shows `–` before the first response and after an Esc interrupt. When a compaction window
  smaller than the model's is set (`/config`, settings or `CLAUDE_CODE_AUTO_COMPACT_WINDOW`), the
  band measures against it; it reads that window from the context breakdown after each turn.
  Then how many tokens the last turn added, and the share of its input the prompt cache served.
- **Session**: the model, its effort level, how long the session has run and what it has cost.

The desktop Code tab draws SVG rings; the terminal draws `○◔◑◕●` glyphs. Nothing is drawn in
`claude -p`, the VS Code chat panel or the Agent SDK.

## Context pane

`/usage-context` opens a pane with the context window broken down as `/context` breaks it down:
one row per category with its tokens and share of the window, and where the window comes from.
`r` counts again.

## Demo pane

`/usage-demo` opens a pane whose buttons try out what a mod can do: toasts, transcript notes, the
status line, `$.ui.ask`, a Haiku call (`$.model.complete`, spends your plan), a summary of the
conversation (`$.model.fork`), filling the prompt box, starting a turn, hidden prompt context, a
spinner suffix, tagged tool rows, a guard that asks before every Bash call, `$.state`, a
`$.clock` timer, `$.store`, Input, Select, Svg, Code, Link and a second pane as a tab. The toggles
stay on until switched off or until `/clear`.

## Install

```bash
claude plugin install usage-band@meyden
```

Run `/reload-plugins` in a session that was already open. No `userConfig`.

## Tested with

Claude Code 2.1.325. `claude plugin validate` reports:

```
hooks: session.start, command.run{command=usage-context}, turn.step, turn.complete, command.run{command=usage-demo}, tool.call{tool=Bash}, prompt.submit, ui.render{component=Spinner}, ui.render{component=ToolUse}, ui.render{component=Pane}, session.measure, ui.render{component=AbovePrompt}
calls: $.clock.every, $.clock.now, $.command.register, $.model.complete (via haiku), $.model.fork (via forkSummary), $.prompt.fill, $.prompt.submit, $.session.model, $.session.usage, $.state.get, $.state.set, $.store.get (via storeDemo), $.store.set (via storeDemo), $.ui.ask, $.ui.close, $.ui.invalidate, $.ui.log, $.ui.open, $.ui.resolve, $.ui.status (via toggleStatus), $.ui.toast
```

## Stored data

One `$.store` key, `demo-presses`, counts presses of the demo's store button.
