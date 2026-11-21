---
name: to-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to GitHub Issues as an epic with native sub-issues and edges as native blocking links.
disable-model-invocation: true
---

# To Tickets

## Project rules

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/context.sh" to-tickets "${CLAUDE_PROJECT_DIR}"`


Break a plan, spec, or conversation into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it.

The issue tracker configuration should have been provided to you. If not, tell the user to run `/dev-workflow:setup`.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Take stock of the tracker

A re-plan usually lands on work that already has tickets, so the plan is drafted against them, not beside them. Find every existing issue that belongs to this body of work: the spec or `[Epic]` issue the conversation or argument names, with its native sub-issues; failing that, search the project's open and closed issues for the same work through the `github-flow:github` skill. Read each match's body and note its state: open, in progress (assigned or with an open PR), or closed.

The result is the **inventory**.

**Done when** you can name every existing issue that belongs to this work with its state, or can say where you looked and that none exists.

### 3. Survey the codebase

Read the code before drafting slices; this step is not optional, and having glanced at the repo earlier in the conversation does not discharge it. Each ticket's implementation plan names the modules and interfaces it touches, and you cannot name them without having read them.

Read the modules the work touches and the ones next to them, until you can name:

- the **existing modules, interfaces and types** the work extends, by their domain names
- the **prior art**: the closest thing this codebase already does, which the new code should end up looking like
- the **conventions** that area already follows and the new code inherits: error handling, validation, state, naming, test layout
- the **constraints** already fixed: the ADRs covering this area, and the glossary vocabulary the ticket titles and bodies must use

**Extend before inventing.** Matching what exists is the default and needs no justification. A new module, pattern or abstraction is a decision, and the ticket introducing it carries the reason nothing existing fit.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

**Done when** all four are written down, and every slice you are about to draft can be described in the project's own vocabulary.

### 4. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges**: the other tickets that must complete before it can start. A ticket with no blockers can start immediately. Together the tickets and their edges form a **task graph**, not a list of steps; `/dev-workflow:implement` walks it frontier by frontier.

Map every slice onto the inventory. Each slice is one of:

- **keep #n**: an existing ticket already covers it as written
- **revise #n**: an existing ticket covers it, but its scope, plan, or blocking edges change
- **new**: nothing in the inventory covers it

Every open inventory ticket that no slice maps to is **obsolete**. Closed tickets are finished work: the plan builds on them and cuts only what is still open.

**Don't make a ticket out of the planning session's own documents.** Glossary entries and ADRs are written during planning, not scheduled after it (see `/dev-workflow:spec-planning`). A ticket that says "write the ADR" records that the reasoning was once known and is now gone. If one is missing, write it now rather than filing it.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket; green is promised only there.

### 5. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Status**: keep #n / revise #n (and what changes) / new
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Below it, list the obsolete tickets, each with a proposed fate: close with a note naming what supersedes it, or leave open because it still stands on its own. A revision to a ticket already in progress gets called out, since someone is building against its current text.

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct: does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?
- Is the mapping onto existing tickets right, and what happens to each obsolete one?

**Done when** the user has approved the breakdown.

### 6. Publish the tickets to the configured tracker

**A breakdown into several tickets is an epic, and the epic gets published too.** The set of tickets is a body of work, and it needs one umbrella ticket that owns it; otherwise the plan exists only in this conversation and the tracker shows an unrelated-looking pile. If the inventory holds an `[Epic]` issue (published by `/dev-workflow:to-spec` or by an earlier planning round), that issue **is** the epic: hang the tickets off it and bring its body up to date with the new plan. Otherwise create the epic **first**, so every ticket can reference it. This holds whether the plan came from an existing ticket or from a conversation; what stays standalone is work that was never a body of work (a lone bug report, a single improvement) or whatever the user says to leave alone.

**A bug report or a single change needs no epic.** Publish one ticket, written to the same detail bar as any other, and mention the issue the user reported or planned in its body (`Relates to #<n>`), so the work stays attached to what prompted it without an umbrella that owns nothing.

The epic's body carries what the tickets can't: what the whole thing delivers, the decisions taken while planning and why, and the shape of the passes. It is an index, not a store: it gists and links, it does not restate the tickets.

Publish the approved plan against the inventory to GitHub Issues, following `docs/agents/issue-tracker.md`, in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers:

- **new**: create an issue as a native sub-issue of the epic
- **revise**: edit the existing issue in place (title, body, blocking links), then add a comment stating what changed and why
- **keep**: leave it as it is, apart from blocking links to tickets that are new in this round
- **obsolete**: close only what the user approved closing, each after a comment naming what supersedes it

The epic is an **ordinary issue** with an `[Epic] ` title prefix, and each ticket is attached as its **native sub-issue** (`--parent <epic>`). Blocking edges between tickets are a **separate** relation from that membership: native `blocked-by` dependencies, written explicitly; use both, never one in place of the other. Apply the label that marks a ticket agent-grabbable, and any workstream or priority labels the project already uses, reading its existing vocabulary rather than inventing names. The `github` skill holds the mechanics.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do NOT close any pre-existing issue the plan came from.

**A ticket body is a blueprint.** A developer, or a fresh agent context, must be able to implement the slice without re-deriving the design: which existing modules it extends, which prior art it imitates, every decision planning took about this slice, and what must be true when it is done. A title plus a checklist is not a ticket. Write the sections in the project's language (e.g. `## Problem` / `## Lösungsplan` / `## Akzeptanzkriterien` on a German project).

**Done when** every inventory ticket is kept, revised, or handled as the user decided, every new issue covers work that no existing ticket covered, and every published ticket meets that bar. If you cannot write a ticket's implementation plan, you have not read enough code; go back to it rather than publish a vague ticket that sends an agent off to invent structure the codebase already has.

<issue-template>

## TL;DR

One or two sentences: what this ticket builds and why.

## Problem

The current state and why it cannot stay: what is missing, wrong, or blocked, in the project's domain vocabulary.

## Solution plan

A numbered list of implementation steps a developer can follow without further design work. Each step names the module, interface, or symbol it touches, by its domain name rather than by file path, says whether it extends something existing or adds something new, and states what changes and why. Cover every layer the slice cuts through (schema, API, UI, tests), the order to take them in, and how to verify each step landed. Name the seams the tests go through and the prior art in the codebase worth imitating.

## Acceptance criteria

- [ ] Observable behaviour 1: outcomes, not implementation steps restated
- [ ] Observable behaviour 2

</issue-template>

Membership and blocking are not written into the body (no `## Blocked by`, `## Sub-Issues` or parent section): the parent relation and the `blocked-by` dependencies are native, render on the issue by themselves, and a hand-written copy drifts and then lies.

<epic-template>

Title: `[Epic] <what the whole thing delivers>`

**TL;DR:** one or two sentences on what is being built and why.

## What this epic delivers

The end state, from the user's perspective. What is true once every child is closed.

## Decisions taken during planning

The choices that shaped the breakdown and the reason each won. This is the part that evaporates otherwise: the tickets record what to build, never why it is shaped that way.

## Shape of the work

How the children group: passes, phases, or the sequence the frontier will walk.

</epic-template>

The tickets themselves are not listed in the epic body; they are its native sub-issues, and GitHub renders the list with a progress bar. A ticket added later is attached with `--add-sub-issue`, not written into the body.

In both templates, avoid specific file paths or code snippets: they go stale fast; name modules, interfaces and symbols instead. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.
