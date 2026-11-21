---
name: interview
description: Interview the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, sharpen a plan through structured questioning, or asks to be interviewed about a decision.
---

## Project rules

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/context.sh" interview "${CLAUDE_PROJECT_DIR}"`


Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree **one question at a time**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. From the frontier, pick the single most **load-bearing** question, the one whose answer reshapes the most of the tree (other frontier questions depend on it, or it could make them moot). Ask only that one, with your recommended answer, then wait for the user's answer.

Format each question like so, as the last thing in your reply:

```
❓ **<question title>** · <n> open

<question body, might be multiple paragraphs>

1. <choice>
2. <choice>

➡️ <number of the recommended choice> – <why>
```

`<n>` is how many decisions are on the frontier besides this one. List 2 to 9 choices, one line each, numbered from 1, and recommend one of them by its number. A question without real choices (a name, a value) has no numbered list; its ➡️ line holds the recommended answer itself. The dev-workflow mod reads this block and offers each choice as a digit key, so keep the markers exactly as shown. The user answers with a digit, with a digit followed by a remark, or in their own words.

Every answer reshapes the tree: it settles a decision, pushes the frontier outward, and can prune branches you had planned to ask about. Recompute the frontier after each answer and pick the next question from what is actually open now. There is no cap on the number of questions; the tree decides how many it takes.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent with a fresh context window to find it. Don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report. Keep asking from the rest of the frontier meanwhile. The _decisions_ are the user's. Put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
