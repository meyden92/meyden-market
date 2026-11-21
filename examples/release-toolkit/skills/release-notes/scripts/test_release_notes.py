#!/usr/bin/env python3
"""Tests for the release-notes pipeline. Standard library only.

    python3 -m unittest discover -s scripts -p 'test_*.py' -v
    ./test_release_notes.py

The end-to-end test builds a throwaway git repository, so it needs `git` on
PATH. It is skipped when git is unavailable rather than failing the suite.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import classify_changes as cc  # noqa: E402
import collect_commits as col  # noqa: E402
import render_notes as rn  # noqa: E402


def full_sha(short: str) -> str:
    """Expand a 3-character test id into a stable 40-character SHA."""
    return (short * 40)[:40]


def commit(sha: str, subject: str, body: str = "", author: str = "Dev") -> dict:
    return {
        "sha": full_sha(sha),
        "short_sha": sha,
        "author": author,
        "date": "2025-03-14T10:00:00+00:00",
        "subject": subject,
        "body": body,
        "trailers": col.parse_trailers(body),
    }


class TestSubjectParsing(unittest.TestCase):
    def test_plain_type(self):
        parsed = cc.parse_subject("feat: add retry flag")
        self.assertTrue(parsed["conventional"])
        self.assertEqual(parsed["type"], "feat")
        self.assertIsNone(parsed["scope"])
        self.assertFalse(parsed["breaking"])
        self.assertEqual(parsed["description"], "add retry flag")

    def test_scope_and_bang(self):
        parsed = cc.parse_subject("feat(api)!: drop v1 endpoints")
        self.assertEqual(parsed["scope"], "api")
        self.assertTrue(parsed["breaking"])

    def test_uppercase_type_is_normalized(self):
        self.assertEqual(cc.parse_subject("FIX: typo")["type"], "fix")

    def test_unconventional_subject(self):
        parsed = cc.parse_subject("merged the thing")
        self.assertFalse(parsed["conventional"])
        self.assertIsNone(parsed["type"])
        self.assertEqual(parsed["description"], "merged the thing")

    def test_colon_in_description_is_kept(self):
        parsed = cc.parse_subject("fix: handle URLs like http://x")
        self.assertEqual(parsed["description"], "handle URLs like http://x")


class TestTrailers(unittest.TestCase):
    def test_trailing_block_only(self):
        body = "Some prose: with a colon.\n\nRefs: #12\nBREAKING CHANGE: config renamed"
        trailers = col.parse_trailers(body)
        self.assertEqual(trailers["refs"], "#12")
        self.assertEqual(trailers["breaking change"], "config renamed")
        self.assertNotIn("some prose", trailers)

    def test_empty_body(self):
        self.assertEqual(col.parse_trailers(""), {})


class TestBreakingDetection(unittest.TestCase):
    def test_bang_marker(self):
        c = commit("aaa", "feat(api)!: drop v1")
        breaks, note = cc.is_breaking(c, cc.parse_subject(c["subject"]))
        self.assertTrue(breaks)
        self.assertIsNone(note)

    def test_trailer_supplies_note(self):
        c = commit("bbb", "feat: new config", "BREAKING CHANGE: 'legacy' removed")
        breaks, note = cc.is_breaking(c, cc.parse_subject(c["subject"]))
        self.assertTrue(breaks)
        self.assertEqual(note, "'legacy' removed")

    def test_mid_body_breaking_paragraph_still_counts(self):
        c = commit("ccc", "fix: tighten parser", "BREAKING CHANGE: rejects bare ints\n\nMore prose.")
        breaks, note = cc.is_breaking(c, cc.parse_subject(c["subject"]))
        self.assertTrue(breaks)
        self.assertEqual(note, "rejects bare ints")

    def test_non_breaking(self):
        c = commit("ddd", "fix: off-by-one")
        breaks, _ = cc.is_breaking(c, cc.parse_subject(c["subject"]))
        self.assertFalse(breaks)


class TestRevertPairing(unittest.TestCase):
    def test_pair_cancels_out(self):
        # Newest first, as git log emits.
        commits = [
            commit("ccc", 'Revert "feat: add widget"'),
            commit("bbb", "fix: unrelated"),
            commit("aaa", "feat: add widget"),
        ]
        churn = cc.find_reverted(commits)
        self.assertEqual(churn, {full_sha("aaa"), full_sha("ccc")})

    def test_revert_without_target_is_not_churn(self):
        commits = [commit("ccc", 'Revert "feat: never happened here"')]
        self.assertEqual(cc.find_reverted(commits), set())

    def test_revert_of_revert_leaves_original_standing(self):
        commits = [
            commit("ddd", 'Revert "Revert "feat: add widget""'),
            commit("ccc", 'Revert "feat: add widget"'),
            commit("aaa", "feat: add widget"),
        ]
        churn = cc.find_reverted(commits)
        self.assertIn(full_sha("aaa"), churn)
        self.assertIn(full_sha("ccc"), churn)
        self.assertNotIn(full_sha("ddd"), churn)


class TestVersionBump(unittest.TestCase):
    def test_patch(self):
        self.assertEqual(cc.bump_version("1.4.2", "patch"), "1.4.3")

    def test_minor_resets_patch(self):
        self.assertEqual(cc.bump_version("1.4.2", "minor"), "1.5.0")

    def test_major_resets_minor_and_patch(self):
        self.assertEqual(cc.bump_version("1.4.2", "major"), "2.0.0")

    def test_v_prefix_is_preserved(self):
        self.assertEqual(cc.bump_version("v1.4.2", "minor"), "v1.5.0")

    def test_zero_major_breaking_bumps_minor(self):
        self.assertEqual(cc.bump_version("0.3.1", "major"), "0.4.0")

    def test_prerelease_promotes_to_release(self):
        self.assertEqual(cc.bump_version("2.0.0-rc.1", "major"), "2.0.0")

    def test_invalid_version_raises(self):
        with self.assertRaises(ValueError):
            cc.bump_version("not-a-version", "patch")


class TestClassify(unittest.TestCase):
    def setUp(self):
        self.document = {
            "range": "v1.4.0..HEAD",
            "base": "v1.4.0",
            "head": "HEAD",
            "commits": [
                commit("aaa", "feat(cli): add --retry flag"),
                commit("bbb", "fix: crash on BOM in config"),
                commit("ccc", "chore: bump linter"),
                commit("ddd", "refactor: extract transport"),
                commit("eee", "security: patch header parsing"),
                commit("fff", "deprecate: mark sync.legacy for removal"),
            ],
        }

    def test_minor_bump_from_feat(self):
        result = cc.classify(self.document, "1.4.0")
        self.assertEqual(result["bump"], "minor")
        self.assertEqual(result["next_version"], "1.5.0")

    def test_major_bump_wins_over_feat(self):
        self.document["commits"].append(commit("999", "feat(api)!: drop v1"))
        result = cc.classify(self.document, "1.4.0")
        self.assertEqual(result["bump"], "major")
        self.assertEqual(result["next_version"], "2.0.0")
        self.assertEqual(len(result["breaking"]), 1)

    def test_patch_bump_when_only_fixes(self):
        self.document["commits"] = [commit("bbb", "fix: crash")]
        result = cc.classify(self.document, "1.4.0")
        self.assertEqual(result["bump"], "patch")
        self.assertEqual(result["next_version"], "1.4.1")

    def test_sections(self):
        sections = cc.classify(self.document, "1.4.0")["sections"]
        self.assertEqual(len(sections["Added"]), 1)
        self.assertEqual(len(sections["Fixed"]), 1)
        self.assertEqual(len(sections["Security"]), 1)
        self.assertEqual(len(sections["Deprecated"]), 1)

    def test_non_user_facing_commits_are_excluded_with_a_reason(self):
        result = cc.classify(self.document, "1.4.0")
        excluded = {e["short_sha"] for e in result["excluded"]}
        self.assertEqual(excluded, {"ccc", "ddd"})
        self.assertTrue(all(e["reason"] for e in result["excluded"]))

    def test_unconventional_commit_is_surfaced_not_dropped(self):
        self.document["commits"].append(commit("zzz", "made it faster"))
        result = cc.classify(self.document, "1.4.0")
        self.assertEqual(len(result["unconventional"]), 1)
        changed = {e["short_sha"] for e in result["sections"]["Changed"]}
        self.assertIn("zzz", changed)

    def test_stats_account_for_every_commit(self):
        result = cc.classify(self.document, "1.4.0")
        stats = result["stats"]
        self.assertEqual(
            stats["total"],
            stats["included"] + stats["excluded"] + stats["churn"],
        )

    def test_missing_current_version_leaves_next_version_null(self):
        self.assertIsNone(cc.classify(self.document, None)["next_version"])


class TestRender(unittest.TestCase):
    def setUp(self):
        document = {
            "range": "v1.4.0..HEAD",
            "commits": [
                commit("aaa", "feat(cli): add --retry flag"),
                commit("bbb", "fix: crash on BOM in config"),
                commit("ccc", "feat(api)!: drop v1 endpoints", "BREAKING CHANGE: use /v2"),
                commit("ddd", "chore: bump linter"),
            ],
        }
        self.data = cc.classify(document, "1.4.0")

    def test_changelog_header(self):
        out = rn.render_changelog(self.data, "2.0.0", "2025-03-14", show_sha=True, show_scope=True)
        self.assertTrue(out.startswith("## [2.0.0] - 2025-03-14"))

    def test_breaking_gets_its_own_section_and_note(self):
        out = rn.render_changelog(self.data, "2.0.0", "2025-03-14", show_sha=False, show_scope=True)
        self.assertIn("### Breaking changes", out)
        self.assertIn("**BREAKING:**", out)
        self.assertIn("use /v2", out)

    def test_breaking_entry_is_not_duplicated_in_added(self):
        out = rn.render_changelog(self.data, "2.0.0", "2025-03-14", show_sha=False, show_scope=True)
        self.assertEqual(out.count("Drop v1 endpoints"), 1)

    def test_sha_toggle(self):
        with_sha = rn.render_changelog(self.data, "2.0.0", "2025-03-14", show_sha=True, show_scope=True)
        without = rn.render_changelog(self.data, "2.0.0", "2025-03-14", show_sha=False, show_scope=True)
        self.assertIn("(aaa)", with_sha)
        self.assertNotIn("(aaa)", without)

    def test_scope_toggle(self):
        without = rn.render_changelog(self.data, "2.0.0", "2025-03-14", show_sha=False, show_scope=False)
        self.assertNotIn("**cli:**", without)

    def test_excluded_commit_never_reaches_the_notes(self):
        out = rn.render_changelog(self.data, "2.0.0", "2025-03-14", show_sha=True, show_scope=True)
        self.assertNotIn("linter", out)

    def test_empty_release_says_so(self):
        empty = cc.classify({"range": "x..y", "commits": [commit("ddd", "chore: noop")]}, "1.0.0")
        out = rn.render_changelog(empty, "1.0.1", "2025-03-14", show_sha=False, show_scope=False)
        self.assertIn("No user-facing changes", out)

    def test_review_style_lists_excluded(self):
        out = rn.render_review(self.data, "2.0.0", "2025-03-14")
        self.assertIn("REVIEW SECTION", out)
        self.assertIn("Excluded", out)
        self.assertIn("linter", out)

    def test_announce_style_has_upgrade_section_when_breaking(self):
        out = rn.render_announce(self.data, "2.0.0", "2025-03-14")
        self.assertIn("# Release 2.0.0", out)
        self.assertIn("## Before you upgrade", out)


@unittest.skipIf(shutil.which("git") is None, "git is not on PATH")
class TestEndToEnd(unittest.TestCase):
    """Build a real repository and run all three stages against it."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.repo = Path(self.tmp)
        env = {
            "GIT_AUTHOR_NAME": "Test",
            "GIT_AUTHOR_EMAIL": "test@example.com",
            "GIT_COMMITTER_NAME": "Test",
            "GIT_COMMITTER_EMAIL": "test@example.com",
        }
        self.env = env
        self._git("init", "-q", "-b", "main")
        self._git("config", "user.email", "test@example.com")
        self._git("config", "user.name", "Test")
        (self.repo / "README.md").write_text("hello\n")
        self._git("add", ".")
        self._git("commit", "-q", "-m", "chore: initial commit")
        self._git("tag", "v1.0.0")

        for message in [
            "feat(cli): add --retry flag",
            "fix: crash on empty config",
            "chore: bump dev deps",
        ]:
            (self.repo / "README.md").write_text(message + "\n")
            self._git("add", ".")
            self._git("commit", "-q", "-m", message)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _git(self, *args):
        import os

        subprocess.run(
            ["git", "-C", str(self.repo), *args],
            check=True,
            capture_output=True,
            env={**os.environ, **self.env},
        )

    def test_pipeline(self):
        commits = col.collect(self.repo, "v1.0.0..HEAD", include_merges=False)
        self.assertEqual(len(commits), 3)

        classified = cc.classify(
            {"range": "v1.0.0..HEAD", "commits": commits}, "1.0.0"
        )
        self.assertEqual(classified["bump"], "minor")
        self.assertEqual(classified["next_version"], "1.1.0")

        notes = rn.render_changelog(
            classified, "1.1.0", "2025-03-14", show_sha=True, show_scope=True
        )
        self.assertIn("Add --retry flag", notes)
        self.assertIn("Crash on empty config", notes)
        self.assertNotIn("bump dev deps", notes)

    def test_base_resolution_finds_the_tag(self):
        self.assertEqual(col.resolve_base(self.repo), "v1.0.0")

    def test_cli_stages_are_wired_together(self):
        collected = col.main(["--repo", str(self.repo), "--range", "v1.0.0..HEAD",
                              "-o", str(self.repo / "commits.json")])
        self.assertEqual(collected, 0)
        document = json.loads((self.repo / "commits.json").read_text())
        self.assertEqual(len(document["commits"]), 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
