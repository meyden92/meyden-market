#!/usr/bin/env python3
"""Tests for read_body's stdin rule.

stdin is read only when `-` was given. The old `isatty()` heuristic hung
every body-less `issue update` under an agent, where stdin is a pipe that is
not a terminal and never delivers anything. Standard library only, no GitHub.
"""
import argparse
import importlib.util
import io
import os
import sys
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))


def load_issue_module():
    """Import scripts/github/issue.py by path; it is a script, not a package."""
    path = os.path.join(HERE, "..", "scripts", "github", "issue.py")
    spec = importlib.util.spec_from_file_location("meyden_issue", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SilentPipe(io.StringIO):
    """stdin as an agent sees it: not a terminal, and nothing ever arrives.

    `read()` fails the test instead of blocking, so a regression shows up as
    a failure rather than a hang.
    """

    def isatty(self):
        return False

    def read(self, *args):
        raise AssertionError("read_body touched stdin although `-` was not given")


def body_args(stdin=False):
    return argparse.Namespace(body=None, body_file=None, stdin=stdin)


class ReadBody(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.read_body = staticmethod(load_issue_module().read_body)

    def test_without_dash_stdin_is_left_alone(self):
        with mock.patch.object(sys, "stdin", SilentPipe()):
            self.assertIsNone(self.read_body(body_args()))

    def test_dash_reads_stdin(self):
        with mock.patch.object(sys, "stdin", io.StringIO("TL;DR: hallo\n\nBody")):
            self.assertEqual(self.read_body(body_args(stdin=True)), "TL;DR: hallo\n\nBody")

    def test_dash_with_blank_stdin_is_no_body(self):
        with mock.patch.object(sys, "stdin", io.StringIO(" \n")):
            self.assertIsNone(self.read_body(body_args(stdin=True)))


class ParserAcceptsDash(unittest.TestCase):
    """Every verb that takes a body accepts `-`, and none sets it by default."""

    @classmethod
    def setUpClass(cls):
        cls.parser = load_issue_module().build_parser()

    def test_dash_sets_stdin_on_every_body_verb(self):
        for argv in (
            ["create", "--title", "t", "-"],
            ["update", "5", "-"],
            ["comment", "5", "-"],
            ["append", "5", "-"],
            ["sub", "create", "3", "--title", "t", "-"],
        ):
            with self.subTest(argv=argv):
                self.assertTrue(self.parser.parse_args(argv).stdin)

    def test_update_without_dash_does_not_read_stdin(self):
        args = self.parser.parse_args(["update", "5", "--title", "x"])
        self.assertFalse(args.stdin)
        with mock.patch.object(sys, "stdin", SilentPipe()):
            self.assertIsNone(load_issue_module().read_body(args))


if __name__ == "__main__":
    unittest.main()
