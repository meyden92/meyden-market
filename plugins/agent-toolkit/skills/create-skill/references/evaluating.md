# Running evals

Measuring a skill against a baseline: does having it actually change what the agent produces?

Worth doing when the skill has objectively verifiable output: file transforms, data extraction, code generation, a fixed workflow. Skills whose value is subjective (writing style, visual design) are better judged by eye; run them through the viewer for the human review, and skip the assertions.

## The first-party alternative

`claude plugin eval` scores a plugin's eval suite and reports a delta against a no-plugin arm it
builds itself. When the skill under test lives in a plugin, reach for it first: it is one command,
there is no workspace to lay out, and the isolation the rest of this document works to get right is
already handled.

```bash
claude plugin eval init                 # interview that authors a suite under evals/
claude plugin eval <plugin-dir>         # run it
```

Cases live under `evals/` as `case.yaml`, or as `prompt.md` beside `graders/*.md`. The target can
also be a plugin name or a `plugin@marketplace` id, and a `@skills-dir` plugin resolves too, so a
skill directory that carries a `.claude-plugin/plugin.json` is a valid target without being
installed.

It evaluates the **plugin**, not one skill. To attribute a result to the skill you are working on,
give the case a grader marked `with-only`; `tool_used: Skill` is the canonical one. Under the
default `--ablation with-without`, those graders read as a plugin-fired indicator rather than part of
the score, which makes them a cheap triggering check alongside the output score.

Flags that matter: `--runs <n>` (default 3), `--case <glob>` and `--tag`, `--judge-model` (haiku by
default, so raise it when the grading is subtle), `--threshold <0..1>` (exit 1 below it, default
1.0), `--report <path>` and `--json [path]`. It spends real tokens and publishes the HTML report to
claude.ai unless you pass `--no-publish`, so confirm both with the user before the first run.

Stay with the harness below when you need what `plugin eval` has no equivalent for: the viewer's
human feedback box, `--baseline` against a snapshot of the previous version of the skill,
`--previous-workspace` to see iteration N-1 beside N, or the triggering loop in
[triggering.md](triggering.md). In practice `plugin eval` is the number you quote and this harness is
how you earn a better one.

## Workspace

Results go **outside the user's repo**, in the session scratchpad directory if one is set, otherwise `~/.claude/skill-evals/<skill-name>/`. Each run generates a whole throwaway project; writing those next to the skill litters the repo and drops stray `.claude/` directories into it.

Organize by iteration: `<workspace>/iteration-1/`, `iteration-2/`, … The runner creates the per-case directories itself.

## Phase 1: Launch the runs

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/run_output_eval.py \
  --skill-path <path-to-skill> \
  --evals <path-to-skill>/evals/evals.json \
  --workspace <workspace>/iteration-<N>
```

Run it in the background, since Phase 2 is designed to fill the wait.

Each case runs twice: once with the skill installed into a fresh project's `.claude/skills/`, once without. Both arms launch headless with `--setting-sources project`.

**That flag is what makes the baseline mean anything**, and it is the reason to use this script rather than orchestrating runs by hand. Two things go wrong otherwise, and both silently produce a *plausible* benchmark rather than an error:

- Subagents inherit the current session's skill listing, so a "no skill" baseline can still see and invoke the skill under test. Instructing the subagent to ignore it is not isolation.
- Personal skills in `~/.claude/skills/` follow a run into *any* working directory. Changing directory does not exclude them; `--setting-sources project` does.

Claude Code's own bundled skills (`dataviz`, `simplify`, `run`, …) stay visible in both arms. That is intended: constant across arms, and present in real usage too.

Runs use `--permission-mode bypassPermissions` because they are confined to a throwaway directory. Anything stricter silently denies tool calls in headless mode, which understates what the skill can do.

Flags worth knowing:

| Flag | Use |
| :-- | :-- |
| `--baseline <snapshot>` | Compare against a previous version instead of no-skill. Snapshot first: `cp -r <skill> <workspace>/skill-snapshot/`. Arm is named `old_skill`. |
| `--runs-per-arm <n>` | 1 while iterating; **3 or more for any comparison you intend to believe**, since a single run per arm gives a pass-rate delta that is mostly noise, and the benchmark's ± stddev is empty. |
| `--model <id>` | Match the model powering this session so results reflect what the user sees. |
| `--only <id> …` | Rerun single cases without redoing the set. |
| `--retry-failed` | Re-run only the runs whose `timing.json` status is not `ok`. |
| `--arms <name> …` | Run one arm at a time. Needed when the skill writes to shared external state (a live tracker, a shared database), because otherwise the first arm's writes become the second arm's starting conditions. Reset the state between arms. |
| `--workers <n>` / `--timeout <s>` | Default 4 and 900s. Raise the timeout for long-running skills. |

Per run the script writes `eval_metadata.json`, `timing.json`, `transcript.md`, `result.json`, and an `outputs/` snapshot, plus a workspace manifest (`eval_run.json`) that the grader reads.

`outputs/` captures everything the run left behind, including what it wrote under `.claude/`; only the injected skill itself is excluded. That matters when the skill under test *authors* files there: dropping the whole `.claude/` tree would discard the deliverable and leave an empty `outputs/` that grades identically to a run which did nothing. Give each eval a descriptive `name` in `evals.json`, since it becomes the directory name and the viewer's label.

**Done when** every run reports `ok`. Anything else records its reason in `timing.json` and `stderr.txt`; re-run those with `--retry-failed` before drawing conclusions, since a timeout reads exactly like a skill that produced nothing.

## Phase 2: Draft assertions while the runs work

Assertions are the quantitative half. A good one is objectively verifiable and *discriminating*: it passes when the skill genuinely worked and fails when it didn't. "Created a file named report.md" is weak, since a hallucinated report passes it. "report.md contains the three column headers from the input CSV" is strong.

Add them to the cases in `evals/evals.json`:

```json
{"id": 1, "name": "descriptive-slug", "prompt": "…", "expected_output": "…",
 "assertions": ["…", "…"], "files": []}
```

Adding assertions after launching costs nothing: the grader re-reads `evals.json` and refreshes each run's metadata before grading. There is no need to re-run the evals to pick them up.

Explain the assertions to the user in plain language and let them correct the set; they know what "correct output" means better than the assertions do.

**Done when** every case has assertions the user has seen, or the skill is one where you and the user agreed assertions don't apply.

## Phase 3: Grade, aggregate, and open the viewer

One command does all three:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/grade_runs.py <workspace>/iteration-<N>
```

It refreshes assertions from `evals.json`, grades every ungraded run with an isolated headless grader, normalizes and validates each `grading.json`, writes `benchmark.json` / `benchmark.md`, and opens the viewer.

| Flag | Use |
| :-- | :-- |
| `--previous-workspace <dir>` | Iteration 2+: shows previous output beside current in the viewer. |
| `--regrade` | Re-grade runs that already have a `grading.json` (use after changing assertions). |
| `--no-view` | Grade and aggregate only. |
| `--static <path>` | Write a standalone HTML file instead of serving. Headless environments; feedback then downloads as `feedback.json`, which you copy into the workspace. |
| `--model` / `--workers` / `--timeout` | Grader model and concurrency. |

Then tell the user, in these terms: *"I've opened the results in your browser. 'Outputs' lets you click through each test case and leave feedback; 'Benchmark' shows the quantitative comparison. Come back when you're done."*

Get the viewer in front of the user **before** forming your own opinion of the outputs, since their reaction is the signal you're iterating on, and it shouldn't arrive pre-anchored by yours.

While they review, read the benchmark for what the aggregates hide: assertions that passed in every arm (they discriminate nothing), evals with high variance across runs, and time/token costs the skill added. [prompts/analyzer.md](../prompts/analyzer.md) has the full analysis pass.

The Outputs tab shows the prompt, the run's final response, rendered output files, previous output when available, the grades, and an auto-saving feedback box. Q&A-shaped skills that write no files render fine, with everything in the final response, but check the run status shown in red before reading anything into an empty-looking output.

**Done when** `benchmark.json` exists, every run has a `grading.json`, and the user has the viewer URL.

## Phase 4: Read the feedback

When the user says they're done, read `<workspace>/iteration-<N>/feedback.json`. Empty feedback on a run means it was fine, so put the effort where there are specific complaints. Then stop the viewer (the script prints its PID).

## Improving from what you learned

1. **Generalize.** You iterated on three prompts because it was fast, but the skill will meet thousands. A change that only fixes these cases is worse than no change, because it adds load and buys nothing. Ask what class of prompt the complaint represents.
2. **Read the transcripts, not just the outputs.** If the skill sent the agent down an unproductive path, the fix is cutting whatever caused it, not adding a correction on top.
3. **Carry the *why* across.** Terse or frustrated feedback still encodes a real need. Put the reasoning into the skill, not the verdict: an instruction the agent understands survives paraphrase; a rule it merely obeys doesn't.
4. **Watch for repeated work across runs.** If every run independently wrote a similar helper or took the same multi-step detour, that's a script waiting to be bundled.

**Done when** you can name a prompt outside the eval set that the change also improves.

## The iteration loop

1. Apply improvements, re-run `validate_skill.py`
2. Re-run `run_output_eval.py` into `iteration-<N+1>/`. For an existing skill, `--baseline` against the previous iteration answers "did this change help?"; for a new skill, keep the no-skill baseline
3. `grade_runs.py <workspace>/iteration-<N+1> --previous-workspace <workspace>/iteration-<N>`
4. Read feedback, improve, repeat

Stop when the user is satisfied, feedback comes back empty, or two iterations in a row fail to move anything.

For a rigorous "is the new version actually better?" verdict, hand both outputs to an independent agent without saying which is which; see [prompts/comparator.md](../prompts/comparator.md). Optional; the human review loop usually settles it.

## The scripts

Two entry points drive this loop: `run_output_eval.py` to launch, `grade_runs.py` to grade, aggregate, and review.

`grade_runs.py` sends [prompts/grader.md](../prompts/grader.md) as each grader's base prompt and appends the run's specifics. Edit that file to change how runs are judged; it never enters this conversation's context, so it can be as detailed as the job needs.

The files in `prompts/` are prompt text handed to a subagent, **not** subagent definitions: they carry no frontmatter and register nothing. That directory is deliberately not called `agents/`, because an `agents/` folder inside a plain skill is ignored by subagent discovery and the name would imply a `grader` agent type that doesn't exist. See [subagents.md](subagents.md#bundling-a-subagent-with-a-skill).

Everything else under `scripts/` is called by those two: `aggregate_benchmark.py` builds the benchmark, `utils.py` and `quick_validate.py` are shared helpers, and `run_eval.py`, `improve_description.py`, and `generate_report.py` belong to the *triggering* loop in [triggering.md](triggering.md). `run_eval.py` in particular measures whether a skill fires, not what it produces, so reach for `run_output_eval.py` when you want output evals.

The file formats these produce are specified in [schemas.md](schemas.md); read it when a run's artifacts look wrong or when writing something that consumes them.
