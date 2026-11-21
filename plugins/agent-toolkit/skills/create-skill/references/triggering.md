# Optimizing a description for triggering

The description is the only thing standing between a user's prompt and the skill firing. This loop measures how well it does that job and rewrites it against the measurement.

A skill that doesn't fire is worth nothing no matter how well the body is written, and the failure is silent: nobody reports the skill that quietly didn't run. So this isn't a finishing flourish: offer it after creating or substantially editing any skill that matters, and reach for it first whenever the complaint is "my skill doesn't trigger". Judgement about wording is guesswork; this produces a number.

## How triggering actually works

Claude picks a skill from its name and description in the skill listing, and only consults one for tasks it can't trivially handle alone. A one-step request ("read this PDF") may not trigger a matching skill at all, and that isn't a description bug.

Build eval queries substantial enough that consulting a skill would genuinely help. A query the agent can answer in one tool call tests nothing.

## Step 1: Generate the queries

20 queries, roughly half that should trigger and half that shouldn't:

```json
[{"query": "the user prompt", "should_trigger": true}]
```

Realism is what makes this work. Real prompts carry file paths, personal context, column names, typos, and casual speech, and they vary wildly in length.

- Weak: `"Format this data"`
- Strong: `"ok so my boss sent me this xlsx (in my downloads, 'Q4 sales final FINAL v2.xlsx') and wants a profit margin % column. revenue is col C, costs col D i think"`

**Should-trigger (8–10):** different phrasings of the same intent; cases where the user never names the skill or the file type; uncommon-but-valid uses; cases where this skill competes with a neighbour and should win.

**Should-not-trigger (8–10):** near-misses. Shared keywords but a different actual need, adjacent domains, situations where another tool fits better. Obviously irrelevant negatives ("what's the weather") test nothing; they pass no matter what the description says.

## Step 2: Review the queries with the user

Bad queries produce a description optimized for the wrong thing, so this step is load-bearing rather than a courtesy.

1. Read the template [../assets/eval_review.html](../assets/eval_review.html)
2. Replace `__EVAL_DATA_PLACEHOLDER__` (the JSON array, unquoted, since it's a JS assignment), `__SKILL_NAME_PLACEHOLDER__`, and `__SKILL_DESCRIPTION_PLACEHOLDER__`
3. Write it to a temp file and `open` it
4. The user edits queries, toggles should-trigger, and clicks "Export Eval Set" → `~/Downloads/eval_set.json` (take the most recent if duplicates like `eval_set (1).json` exist)

## Step 3: Run the loop

Tell the user it takes a while, then run it in the background from `${CLAUDE_SKILL_DIR}`:

```bash
python3 -m scripts.run_loop \
  --eval-set <path-to-eval-set.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

This one runs as a module rather than by path, because it imports its siblings, so it needs the package context.

Pass the model ID from your system prompt so the triggering test matches what the user experiences on their own machine.

The loop splits the set 60% train / 40% test, evaluates the current description across 3 runs per query, proposes rewrites from the failures, re-evaluates, and returns `best_description` chosen by test score. Tail the output periodically and report progress.

What each run tests: the skill's `description` and `when_to_use` go into a temporary command file, and Claude Code builds the listing entry from them as it does for the real skill (`description - when_to_use`). The loop rewrites `description` only. `when_to_use` stays as written, the rewriter sees it so the two don't repeat each other, and the description is limited to what the 1,536-character listing cap leaves after `when_to_use`, never more than 1,024. To change `when_to_use`, edit it and rerun.

Each run gets its own fresh temporary project, so parallel runs can't see each other's command files. It also means the project's own `.claude/` skills and CLAUDE.md aren't loaded; user-level skills, installed plugins and Claude Code's built-in skills are, and they compete with the skill under test as they would for the user.

## Step 4: Apply

Update the frontmatter with `best_description`, show the user before and after, and report both scores.

**Done when** the new description is in the frontmatter, `validate_skill.py` passes, and the user has seen the score it earned.
