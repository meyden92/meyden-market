# Changelog

## 0.3.0

- The context segment measures against the compaction window when one smaller than the model's
  is set. It showed `ctx 183k / 1M` for a 700k window, because `usage.context.window` is the
  model's limit; the compaction window is only in the context breakdown (`rawMaxTokens`), which
  the band now reads after each main-loop turn.
- The context segment adds the tokens the last turn added (`+12k last turn`) and the share of its
  input the prompt cache served (`cache 98%`).
- The session segment adds the effort level and the session's cost.
- New `/usage-context` command: a pane with the context window broken down by category.

## 0.2.1

- `/usage-demo` is registered in non-interactive sessions too. The desktop Code tab starts
  sessions non-interactive, so the command was missing there.

## 0.2.0

- The band shows context fill (`42% ctx 84k / 200k`, amber from 60%, red from 80%) and the model
  with the session's age, in place of cost. The cost ledger (session, day and month totals in
  `$.store`) is removed.
- Terminal rings draw as glyphs again: the band used `'Svg' in els`, which is true on the
  terminal too, so the terminal dropped the icons.
- New `/usage-demo` command: a pane whose buttons try out toasts, transcript notes, the status
  line, `$.ui.ask`, `$.model.complete`, `$.model.fork`, filling and submitting the prompt, hidden
  prompt context, a spinner suffix, tagged tool rows, a Bash guard, `$.state`, `$.clock` timers,
  `$.store`, Input, Select, Svg, Code, Link and a second pane.

## 0.1.0

- First release: a band above the prompt with the plan's 5h and 7d rate-limit windows (percent
  used and time to reset) and the cost of this session, today and this month.
