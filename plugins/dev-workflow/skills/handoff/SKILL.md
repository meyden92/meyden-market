---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

## Project rules

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/context.sh" handoff "${CLAUDE_PROJECT_DIR}"`


Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it in the OS temporary directory, not the workspace, at the path this prints:

```bash
echo "${TMPDIR:-/tmp}/handoff-$(basename "$PWD" | tr -c 'A-Za-z0-9_\n-' '_')-$(date -u +%Y%m%d-%H%M%S).md"
```

The next session in this directory offers that file above the prompt, so keep the name exactly as printed.

Include a "suggested skills" section in the document, which suggests skills that the agent should invoke.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
