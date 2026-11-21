# Claude Code Extensions

The meyden marketplace repository. Its domain is the extension mechanisms Claude Code offers — the things a developer authors and installs — and the vocabulary below exists because those mechanisms are routinely conflated, which leads to instructions being written into the wrong one.

## Language

### Extension mechanisms

**Skill**:
A packaged procedure the agent loads on demand, when the work matches its description. Its purpose is to make a *process* deterministic, not to make the agent's prose better.
_Avoid_: Command, prompt, macro

**Plugin**:
A distributable bundle of skills, subagents, hooks, executables and servers, installed from a marketplace. It is what lets a skill reach past what a skill alone can do — fire from a hook, ship a binary, hold a secret — and what lets a team install any of it at all.
_Avoid_: Package, extension, module

**Marketplace**:
The catalogue a plugin is installed from — a repository carrying a manifest listing its plugins. This repository is one.
_Avoid_: Registry, store, repo

**Hook**:
A shell command the harness runs at a fixed lifecycle event. Unlike everything else here it is *enforced* rather than advisory: it happens regardless of what the agent decides.
_Avoid_: Trigger, callback, event handler

### Instruction files

**CLAUDE.md**:
Instructions a human writes for the agent, loaded into every session in the directory hierarchy above the working directory. Advisory, shared with the team through version control.
_Avoid_: Project memory, config, rules file, context file

**Rule**:
A markdown file under `.claude/rules/`, optionally scoped to file paths so it loads only when the agent touches matching files. The answer to a CLAUDE.md that has grown too large: relocation rather than compression.
_Avoid_: Path rule, conditional instruction, partial

**Auto memory**:
Notes the *agent* writes for itself, per repository, machine-local. Distinct from CLAUDE.md by authorship and by audience, not by content.
_Avoid_: Memory, notes, learnings

The boundary that decides where an instruction belongs: who writes it, whether it loads always or on demand, and whether it is advisory or enforced. A multi-step procedure is a skill; a must-happen-every-time rule is a hook; an instruction that only matters in one area is a path-scoped rule; a personal preference is not shared at all.

### Tracker vocabulary

**Epic**:
An umbrella issue owning the tickets a planning session produced, identified by an `[Epic] ` title prefix. An ordinary GitHub issue whose tickets are its native sub-issues.
_Avoid_: Parent issue, story, initiative, phase

**Ticket**:
One tracer-bullet slice of an epic — a complete path through every layer, demoable on its own, sized to a single fresh context window.
_Avoid_: Task, story, card

**Membership**:
The relation between a ticket and its epic — GitHub's native sub-issue parent relation, the single source of truth. Never mirrored into titles or body checklists, which drift and then lie.
_Avoid_: Nesting, linking

**Blocking**:
The relation saying a ticket cannot start yet — GitHub's native issue dependencies (`blocked by` / `blocking`), free to cross repositories. Separate from membership; neither substitutes for the other.
_Avoid_: Dependency, prerequisite, gating
