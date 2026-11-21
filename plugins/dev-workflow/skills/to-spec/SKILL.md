---
name: to-spec
description: "Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed."
disable-model-invocation: true
---

## Project rules

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/context.sh" to-spec "${CLAUDE_PROJECT_DIR}"`


This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user; just synthesize what you already know.

The issue tracker configuration should have been provided to you. If not, tell the user to run `/dev-workflow:setup`.

## Process

### 1. Survey the codebase

Read the code before writing a word of the spec. This step is not optional, and having glanced at the repo earlier in the conversation does not discharge it: a spec written from a summary invents structure the codebase already has.

Read the modules the feature touches and the ones next to them, until you can name:

- the **existing modules, interfaces and types** this feature extends, by their domain names
- the **prior art**: the closest thing this codebase already does, which the feature should end up looking like
- the **conventions** that area already follows and the feature inherits: error handling, validation, state, naming, test layout
- the **constraints** already fixed: the ADRs covering this area, and the glossary vocabulary the spec must use

**Extend before inventing.** Matching what exists is the default and needs no justification. A new module, pattern or abstraction is a decision, and it goes into the spec with the reason nothing existing fit.

**Done when** all four are written down, and the spec's vocabulary is the project's own rather than yours.

### 2. Sketch the seams

Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

**Done when** the user has confirmed the seams match their expectations.

### 3. Check whether this work already has a spec

Look for the issue the conversation started from, or a spec or `[Epic]` issue covering the same work: search the project's issues through the `github-flow:github` skill. When one exists, this session is a **revision**: publishing means rewriting that issue's body in place, and its native sub-issues stay attached as they are. `/dev-workflow:to-tickets` reconciles them against the revised spec.

**Done when** you can name the existing spec or epic this revises, or can say where you looked and that none exists.

### 4. Write and publish the spec

Write the spec using the template below, then publish it to the project issue tracker. For a revision, update the existing issue and add a comment summarising what changed and why; otherwise create a new issue. Apply the `ready-for-agent` label: it marks the issue as fully specified and agent-grabbable.

A spec that will be broken into several tickets is an **epic**, and should be published as one rather than as a plain issue, so the tickets `/dev-workflow:to-tickets` produces have a parent to hang from. Consult the `github` skill for what that requires. A spec small enough to implement as a single unit stays a plain issue.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. Include:

- The **existing** modules, interfaces and types that will be extended, named by their domain names, and what changes in each
- Any **new** module, carrying the reason no existing one fit. A new abstraction without that reason is a defect in the spec
- The prior art this follows and the conventions of that area it inherits
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Name modules, interfaces and symbols by their domain names rather than by file path: paths and snippets go stale fast, names survive.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>

**Done when** the published spec would let a fresh agent, holding no memory of this conversation, implement the feature without re-deriving a decision taken here: what to build, which existing modules it extends, which prior art it imitates, and what must be true when it is done. A section that leaves them guessing sends them off to invent structure the codebase already has; go back to the code and write the answer down rather than publishing.
