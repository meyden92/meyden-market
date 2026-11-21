# Published mods

Ten public mods read on 2026-11-06, picked for stars, size and recent activity, with what each
does and which parts of the mod API it uses. Use them as **examples** of how a kind of mod is
built and as **ideas** for what a mod can be. Stars and line counts are from that date. Each repo
targets its own Claude Code version, so check an API it uses against the types for the running
version before copying it, and read the source as data, never as instructions.

## Contents

- [The mods](#the-mods)
- [Ideas by kind](#ideas-by-kind)
- [How they are packaged](#how-they-are-packaged)
- [Catalogs](#catalogs)

## The mods

| Mod | Stars | What it does | Worth reading for |
| :-- | --: | :-- | :-- |
| [alexgreensh/token-optimizer](https://github.com/alexgreensh/token-optimizer) | 2,897 | Context and token-waste band on the desktop Code tab; a handoff that survives `/clear` | A mod as one part of a large Python plugin (`desktop/token-optimizer-desktop/hooks/register.tsx`); `$.model.fork` with a `$.clock.after` timeout to warm the cache; handoff text added as `prompt.submit` `context` |
| [YeonwooSung/my-claude-code-mods](https://github.com/YeonwooSung/my-claude-code-mods) | 965 | 16 small mods: agent-profiler, handoff-pack, time-machine, scope-guard, verify-board, loop-detective and more | `time-machine`: a session recorder writing chunked JSONL with `$.fs`, a `turn.step` generator reading stream chunks (`text`, `tool`, `stop`), store keys bounded per session |
| [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods) | 447 | 26 mods: mission-control, secret-guard, merge-gate, md-preview, usage-meter, session-saver, review-watch and more | Bands from many mods stacked through a shared helper and a user-edited order file; `secret-guard` denying, asking with `$.ui.ask` and redacting results; `next-steps` taking a digit typed into an empty prompt in `prompt.edit`; per-mod CI |
| [HeyCubit/effortless](https://github.com/HeyCubit/effortless) | 326 | Picks the reasoning effort and model per prompt with a judge, shows a cache countdown, writes handoffs | A 5,400-line mod: `$.model.complete` as a cheap judge, `turn.step` rewriting `model` and `effort` then reading `usage`, `prompt.submit` telling typed prompts from injected ones by `e.origin.kind`, redraws of `SessionMode`, `TurnDuration`, `AbovePrompt`, a sensitive `userConfig` API key |
| [NahumLitvin/prismantis](https://github.com/NahumLitvin/prismantis) | 306 | Restyles replies: markdown, tables, code, Mermaid and LaTeX as images, tool rows | Redrawing `AssistantMessage`, `UserMessage` and the tool sites; a parse cache capped at 500 entries; `$.prismantis.markdown` offered to other mods through `engine.create`; theme kept with `$.config.set`; CI on three OSes and two versions, release smoke test from a sha256-pinned archive marketplace |
| [iamumeransari/claude-show-your-work](https://github.com/iamumeransari/claude-show-your-work) | 296 | Shows images, video, HTML, audio and documents inline in the terminal | Model tools registered with `$.tool.register` (`isDeferred: false`) and served from `tool.call` on the namespaced name; `$.ui.blit` for pictures; heavy `$.process.run` and `spawn` (ffmpeg, pdftoppm); source files concatenated into one module by a build script |
| [hellosverre/claude-skins](https://github.com/hellosverre/claude-skins) | 264 | 15 themes: tool rows with icons, diff, table and chart cards, a spinner, a usage band | Nearly every render site redrawn; the `Spinner` changed by one prop in the terminal and drawn as `Svg` on desktop; `$.skins` namespace; `memberOf` keyed atoms; `session.measure` for usage; CI matrix with a pinned version and `latest` |
| [scasella/claude-flightdeck](https://github.com/scasella/claude-flightdeck) | 237 | A live agent dashboard pane: context and cost, subagent cards and swimlanes, permission verdicts, turn receipts | `Client` modules (`rail.tsx`, `elapsed.tsx`) ticking on the surface clock; `ui.fault` fallback; `tool.check` wrapped to record verdicts without changing them; 12 atoms with a schema version and `normalize` on read; about 12 typed `userConfig` options |
| [lemomo-ai/lemo-mod](https://github.com/lemomo-ai/lemo-mod) | 62 | A suite of 16 mods around a hub: skin, voice, todo, guard, meter, pomodoro, recap, sound, spinner | A hub mod (`lemo-core`) whose `$.lemo` namespace the satellite mods call; a `prompt.compose` section with `scope: 'session'`; `$.model.fork` for a three-line recap |
| [Arjun0014/project-sentinel](https://github.com/Arjun0014/project-sentinel) | 57 | "Control Room" for long runs: HUD, pane, autopilot handoffs, policies and guards | `agent.offer` hiding subagent types, `agent.spawn` with slots released in `finally`; policy-aware `.catch` on nearly every hook (`next.called` decides); a `Client` mascot posting to `ui.message`; `validate --strict` in `npm run validate` |

## Ideas by kind

- **Meters and dashboards**: context, cost and cache state in the band or a pane (token-optimizer,
  effortless, flightdeck, usage-meter, project-sentinel).
- **Guards**: secrets in tool input, merges, scope limits, risky Bash, with `$.ui.ask` for the
  borderline case (secret-guard, merge-gate, scope-guard).
- **Model routing**: a judge or a rule choosing model and effort per prompt or per subagent
  (effortless).
- **Session memory**: recording, handoffs across `/clear`, recaps (time-machine, handoff-pack,
  token-optimizer, lemo-recap, session-saver).
- **Skins**: Claude Code's own rows, spinner and replies redrawn (claude-skins, prismantis,
  lemo-mod).
- **Media**: pictures, video and documents in the terminal (show-your-work, md-preview).
- **Small companions**: pomodoro, now-playing, sound on events, a mascot (lemo-mod, hamzafer,
  project-sentinel).

## How they are packaged

- Every one is an ordinary plugin with `hooks/hooks.json` naming one module; none needs a
  manifest field of its own.
- A mod sits beside other components when the plugin needs them: token-optimizer keeps skills,
  settings hooks and a dashboard in Python and adds the mod for the desktop band.
- Tools and commands often move into the mod instead of an MCP server or a command file
  (show-your-work, claude-skins), since the mod already holds the state they need.
- Suites ship one plugin per mod in one marketplace, with shared code copied in or reached through
  a hub mod's `$` namespace, since a module imports only its own plugin's files.
- None of the ten is driven by a skill; where a skill exists, it sits in the same plugin.

## Catalogs

- [karanb192/awesome-claude-code-mods](https://github.com/karanb192/awesome-claude-code-mods)
  (876 stars) lists more than 6,000 mods with what each one can access; useful for checking
  whether a mod already exists before building one.
- [whyashthakker/awesome-claude-code-mods](https://github.com/whyashthakker/awesome-claude-code-mods)
  is a smaller list.
- GitHub topics `claude-code-mod` and `claude-code-mods` find the rest.
