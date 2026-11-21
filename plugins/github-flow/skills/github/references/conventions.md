# Why the mandatory conventions exist

SKILL.md states the rules; this file states what each one cost before it became a rule, and where the genuine exceptions are. Read it when a rule looks like it's getting in the way: the reasoning usually names the exception, and a rule you understand survives a situation its author didn't foresee. Several of the incidents happened on GitLab, where these conventions grew up; the failure modes carry over to GitHub unchanged unless noted.

## 1. Status labels and the lifecycle

**Rule:** every issue carries a status label; move it to `doing` at implementation start, `testing` at handover, `done` at close. Don't ask permission.

Boards are organised into columns by label. An issue whose label says `Todo` while someone is actively working on it makes the board lie, and the board is how everyone else decides what to pick up. Asking before each transition is noise; nobody has ever said no.

**Why the names are discovered rather than fixed:** the *stage* is universal, the vocabulary is per project. `In Arbeit`, `Status: Doing`, `workflow::Doing` and `in progress` are the same stage. `meyden-gh issue status` matches on the label's value (prefix stripped, case-folded), so all four resolve, and it refuses rather than inventing one when the project has no label for a stage.

**No label cleans up after itself on GitHub.** GitLab at least made same-scope labels mutually exclusive; GitHub has nothing of the kind, so `Status: Doing` stacks silently next to `Status: Todo` and the issue appears in two columns. The verb removes the previous stage label explicitly for this reason; a raw `gh issue edit --add-label` does not.

**Exception:** a project with no status labels at all. Don't create them; say which stage you'd have set and move on. Adding a label is a project-wide change that reshapes everyone's board.

## 2. Never close without user confirmation

**Rule:** green tests, a clean deploy, and a commit saying "manually verified" are all insufficient. Wait for the user to confirm.

The failure this prevents is specific: an issue was closed on the strength of passing tests and a correct image SHA, and the user immediately found a real behavioural inconsistency in the UI that no test covered. Automated tests verify what someone thought to assert. User-visible inconsistency is exactly the class they miss.

**How to handle "tests pass, it's deployed":** don't offer three options. Say what was verified and ask them to check the specific thing in the UI. Then wait.

**Exception:** the user has already confirmed, in this session, for this issue. Their "passt" is the gate, not a particular phrasing.

## 3. Closing keywords in PR bodies

**Rule:** never `Closes` / `Fixes` / `Resolves #N` in a PR body, or in a commit landing on the default branch. Use `Bezug: #N` or `Part of #N`.

This is the single most effective way to break rule 2, and it doesn't look like a rule violation while you're doing it. The line reads as a cross-reference. It behaves as an action: on merge, GitHub closes the referenced issue. No close command is ever typed, no confirmation is ever sought, and the effect is only visible on an `issue view` *after* the merge, by which point the acceptance window has silently closed. The keyword acts from three places: the PR body, the merge-commit message (`gh pr merge --body`), and any commit that reaches the default branch, and the guard hook watches `gh pr create|edit|merge` for exactly this reason.

`meyden-gh pr` rejects these keywords before creating the PR. `--allow-closing-keywords` exists for the case where the automatic close is genuinely wanted (a chore issue that the merge really does complete), and it should be rare.

**If it already happened:** reopen the issue and get the acceptance done. Treating it as finished because GitHub said so hands the user a decision they never got to make.

## 4. Closing is three ordered steps

**Rule:** solution comment → `done` label → close.

The comment is what makes the issue useful later: what changed, which files, how it was verified. An issue closed without one is a dead end for whoever finds it in six months.

The order matters because the comment is historically the step that fails silently: on GitLab a wrong flag made it vanish while label and close succeeded, leaving a closed issue with no record. `gh issue close --comment "..." --reason completed` removes most of that risk by folding comment and close into one call that fails together; set the `done` label first, then close with the comment. When posting the comment separately (`meyden-gh issue comment`), verify it landed before closing.

Rule 1's label step also matters at close specifically: a `closed` issue still carrying `Testing` keeps showing in the Testing column and reads as outstanding work.

## 5. Commits reference their issue

**Rule:** every commit message contains `#NNN`. No issue exists? Create one first.

The issue is where the design context lives, and the commit is the durable pointer to it, more robust than `git blame` across refactors. "Commit without an issue" is not an option to offer, because the missing issue is exactly the context someone will want later.

Mind rule 3 here: on GitHub, issues and PRs share one number space, and a closing keyword in front of the `#NNN` in a commit that lands on the default branch auto-closes the issue.

**In code comments, `#NNN` is a supplement, never the whole comment.** `// #418` alone records who and when, not what and why, and forces a round-trip into the tracker for anyone reading the code, including readers who have no tracker access after a migration. Write the reason, then attach the number:

- Good: `// Gate before input validation so unlicensed modules fail closed (#418)`
- Anti-pattern: `// #418`

## 6. Epic branches

**Rule:** `epic/<n>-<slug>` off the integration branch, one identically named branch per affected repo, merged back only after the user's test passes, and never letting a merge delete the branch.

With several people working in parallel, an unprotected integration branch protects nothing. Epic branches make review possible and keep half-finished epics out of the shared state.

**Branch survival is a repo setting on GitHub, not a per-merge flag.** `gh pr merge` keeps the branch unless you pass `--delete-branch`, but a repository with *Automatically delete head branches* enabled deletes it regardless, out from under an epic that typically merges more than once (an intermediate state goes out for testing, work continues). Check `gh api repos/{owner}/{repo} --jq .delete_branch_on_merge` before merging epic work, and restore the branch (`git push`) if a merge already ate it. `gh issue develop <n> --name epic/<n>-<slug>` creates the branch linked to its issue.

Rebase or merge the integration branch into the epic branch regularly so the drift stays small; a long-lived epic branch that never syncs turns into a conflict resolution project of its own.

**Exception:** standalone bugfixes and small changes with no epic go directly to the integration branch.

## 7. TL;DR first, the house anatomy, and no verbatim quotes

**Rule:** every issue body opens with a one-or-two-sentence summary; a work ticket then carries problem, solution plan, acceptance criteria, and dependencies. Requirements are written in your own words.

Most people meet an issue as a single line in a long list, or in a notification email showing only the opening text. A leading summary makes it triageable without opening it. Without one, the reader has to parse a dense problem statement to work out whether it concerns them.

**Why the anatomy is mandatory:** a ticket is implemented by someone (human or agent) who was not in the planning conversation. A thin ticket ("add the export button" plus two checkboxes) forces them to re-derive the plan, and they will re-derive a different one: the wrong layer, the wrong module, a fallback nobody wanted. The solution plan is where the planning session's understanding survives: numbered steps, each saying what to change, how, and where at the level of modules, interfaces and behaviour. The acceptance criteria state the observable outcomes that make the ticket closeable, not implementation steps restated as checkboxes. Dependencies are the native parent sub-issue link and native `blocked_by` links (rule 9b), plus related issues mentioned in the body.

**How precise "where" should be depends on when the ticket is written.** A bug ticket filed against code that is broken *today* may pin exact locations: that precision is the value. A ticket cut from a planning session lands days or weeks before implementation starts; file paths and directory structure written then go stale before anyone reads them, so name modules and components by their domain names instead and let the implementer find the current location.

**Why not quote the user:** an issue is a requirements document, not a chat transcript. "User wants: X should do Y" reads as an unprocessed recording, and it demonstrates no understanding of the requirement, which is the actual value being added. Write "X should do Y". Naming the source ("from the planning session") is fine; reproducing the wording is not.

Match the project's existing language. In a German-language project write German with proper umlauts (ä/ö/ü/ß, never ae/oe/ue/ss).

## 8. Overviews are tables

**Rule:** `ID | Description | Assignee | Suggestion`, blocked issues hidden.

A table is read far faster than a bulleted list, and the suggestion column answers the question that actually follows an overview (*where should I start?*) without the user having to extract it from a paragraph.

The assignee column earns its place because "who is on this?" is the other question every overview prompts. On `--mine` it holds one repeated name and is dropped.

**The suggestion column is where invented structure gets in.** It invites an ordering, and an ordering needs relationships, so "sub of", "part of", "blocks" appear next to issues whose hierarchy was never queried. Titles are the usual source. A team that numbers its breakdown in the title (`… (Sub 2 of #NNN)`) is describing an intention, and the parent behind it is frequently never set, so the numbers read like structure while GitHub holds none. Someone planning around that ordering is planning around a fiction, and the mismatch is worth reporting in its own right.

`meyden-gh issue sub list <n>` returns the real sub-issues; `meyden-gh graph <n>` returns the blocker chain. One call settles it. Without the call the relationship is still worth mentioning, as a reading, marked as one. *"Laut Titel ein Sub von #NNN, auf GitHub nicht verknüpft"* tells the user both what you saw and what you did not check.

**Blocked issues are hidden by default** because they aren't actionable and they make a backlog read longer than it is. When one becomes relevant, because its precondition just cleared, put it in a separate section below the table with a heading that says so, rather than mixing it back in.

## 9. Reuse existing labels

**Rule:** read the project's labels and pick from them. Don't create near-duplicates.

Boards, saved filters and automation key on exact label strings. Adding `bug` to a project that already has `Type: Bug` splits the taxonomy silently: the new issue appears on no board, matches no filter, and nothing errors. It surfaces weeks later as a report with wrong numbers.

Read them with `gh label list --limit 200 --json name --jq '.[].name'`: the default `--limit 30` truncates a real taxonomy without saying so, and a label you never saw is a label you'll duplicate.

Map the user's wording onto what exists: "this is a bug" becomes the project's `Type: Bug`. If nothing genuinely fits, leave it unlabelled and say which label you'd suggest adding.

## 9b. Break work down into sub-issues, and record what blocks what

**Rule:** an issue that decomposes into steps gets those steps as **sub-issues**, not as a checklist buried in the description. Ordering constraints get **dependencies**.

The description of a multi-step issue is the worst place to track its steps: it has no state, so nothing rolls up, nobody can be assigned a step, and "how far along is this?" can only be answered by reading prose. Sub-issues give the parent a progress bar and each step its own assignee, labels and close event.

**The two mechanisms are different and not interchangeable:**

| Mechanism | Meaning | Shape | Command |
| :-- | :-- | :-- | :-- |
| Sub-issues | membership, "part of this epic" | one parent, rolls up | `meyden-gh issue sub` |
| Dependencies | ordering, "can't start yet" | many-to-many, directed | `meyden-gh issue link` |

Unlike GitLab's work items, GitHub's hierarchy has no type rules: an issue parents other issues directly (one parent each, up to 100 children, 8 levels). The historical workaround (title suffixes, a hand-maintained `## Sub-Issues` checklist, `relates_to` links standing in for membership) is retired; a hand-written copy of the hierarchy drifts and then lies, while the native relation renders in the UI and answers queries.

Both new and existing issues can be attached: `sub create` for a fresh child, `sub add` for one that already exists. Blocking edges may cross repositories (`owner/repo#N`); a mere topical connection is a mention in the body or a comment, which GitHub backlinks in the timeline by itself.

**Propose the breakdown before creating it.** Filing fifteen sub-issues nobody asked for is noisy and tedious to undo. Once agreed, create the parent first so the children have something to attach to.

## 10. Plans go onto the issues immediately

**Rule:** after a planning round, split the plan across the relevant issues without being asked.

A plan that exists only in the conversation is gone when the session ends, and the next person, including a later session, starts from nothing. Each repo gets the part that concerns it.

Use `meyden-gh issue append` to add to an existing body, or `update` to replace it. `replace` handles surgical edits and refuses unless the old text matches exactly once, because a blind replace on a repeated heading rewrites the wrong section and the damage is visible only to someone re-reading the issue.

## 11. The repository is the scope, submodules included

**Rule:** answer from this repository and its submodules unless the user asked for more, and label it when you go wider.

The account-wide endpoints are the tempting ones: `gh api issues` returns everything assigned to you in one call and looks like a complete answer. It is a complete answer to a question nobody asked. Someone working in one repository who asks "what is assigned to me" means *here*, and a listing that mixes in four dormant tickets from projects they left two years ago is worse than a short one: they now have to filter it themselves, and the filtering is exactly what they delegated.

Submodules are not a separate scope. A superproject that carries its code in submodules is one piece of work, and answering only from the superproject describes almost none of it, since most of the open issues live in the children. `meyden-gh scope` resolves the set from `.gitmodules` rather than from the working tree, because in a fresh clone most submodules are not checked out yet and iterating directories would find a minority of them and report it as the whole.

Out-of-scope results get a count and nothing else. Naming them (reference, repo, title) puts them in front of someone who asked about this repository, and once they are on screen they have to be read and dismissed one by one. That is the work the scope was supposed to do. The count exists only so the user can tell that a wider question is available to ask.

Going wider is legitimate; it has to be asked for. Then `--all` lists them properly. What is never acceptable is presenting an account-wide result as though it were the repository's: the user cannot tell from the output, and will act on it as if it were scoped.

## 12. Verify what GitHub actually did

**Rule:** read back what you wrote.

GitHub reports success on writes it discarded. The reliable example: an assignee without access to the repository is dropped from the request and the call still succeeds. The task then looks assigned on your screen and unassigned on everyone else's. `meyden-gh issue` re-reads every assignment and warns when it didn't stick.

**Bulk body updates need a per-issue check** of title against body. An off-by-one across a range of issues, each plan landing on its neighbour, produces no error at all and is invisible until someone opens one and finds the wrong content.

This is most of the reason to prefer the bundled scripts over hand-written `gh` calls: the verification is already in them.
