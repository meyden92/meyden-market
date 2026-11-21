---
name: spec-planning
description: A relentless planning interview to sharpen a plan or design, which also creates docs (ADRs and glossary) as we go.
disable-model-invocation: true
---

## Project rules

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/context.sh" spec-planning "${CLAUDE_PROJECT_DIR}"`

## Setup check

Before the first question, check that this repo's setup is current: `docs/agents/issue-tracker.md` exists and names the `github-flow:github` skill. If it is missing or still names `tools:github`, tell the user to run `/dev-workflow:setup` first and stop. If `.claude/skill-context/engineering/` exists, tell the user to rename it to `.claude/skill-context/dev-workflow/`.

Call the Skill tool twice, for "dev-workflow:interview" and "dev-workflow:domain-modeling", running the interview with the domain-modeling discipline active throughout.

Neither the glossary entries nor the ADRs are ever a ticket. A planning session that hands its own documents to `/dev-workflow:to-tickets` records only that the reasoning was once known, so write them as they crystallise, so that by the time tickets exist, no ticket covers them.

## When the interview converges

Close the session by proposing the next step, **never straight to tickets**. Both skills are user-invoked: tell the user to run them, do not call them.

1. `/dev-workflow:to-spec`: synthesise the session into a spec first and publish it. The spec is where the session's detail survives; tickets cut directly from a conversation come out shallow, and the implementer inherits the gaps.
2. `/dev-workflow:to-tickets`: then break the published spec into tickets, each carrying the full what/how/where the spec makes possible.

Exception: a bug fix or a single small change needs no spec and no epic: propose `/dev-workflow:to-tickets` directly, which publishes one detailed ticket linked to the issue that prompted it.
