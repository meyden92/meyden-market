#!/usr/bin/env python3
"""Tests for the machine-based pin: canonical_host, pinned_canonical and the
Include-following host list in ssh_common.sh.

`ssh -G` answers from the local config without touching the network. The tests
point it at a temporary config with `-F`, so the user's own ~/.ssh/config never
influences the result. Standard library only.
"""
import importlib.util
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, "..", "scripts", "lib")
HAVE_SSH = shutil.which("ssh") is not None


def load_pin():
    spec = importlib.util.spec_from_file_location("meyden_pin", os.path.join(LIB, "pin.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def ssh_with_config(config_path):
    """A subprocess.run replacement that makes `ssh -G <name>` read config_path."""
    real_run = subprocess.run

    def run(argv, *args, **kwargs):
        if argv[:2] == ["ssh", "-G"]:
            argv = ["ssh", "-G", "-F", config_path] + argv[2:]
        return real_run(argv, *args, **kwargs)

    return run


@unittest.skipUnless(HAVE_SSH, "ssh not installed")
class CanonicalHost(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pin = load_pin()
        cls.tmp = tempfile.mkdtemp()
        cls.config = os.path.join(cls.tmp, "config")
        with open(cls.config, "w") as fh:
            fh.write(
                "Host app1\n  HostName app1.example.com\n  User deploy\n"
                "Host app1-root\n  HostName app1.example.com\n  User root\n"
                "Host app1.example.com\n  HostName app1.example.com\n"
                "Host other\n  HostName other.example.com\n"
            )

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def canonical(self, name):
        with mock.patch.object(self.pin.subprocess, "run", ssh_with_config(self.config)):
            return self.pin.canonical_host(name)

    def test_every_alias_for_one_machine_collapses(self):
        machine = "app1.example.com"
        self.assertEqual(self.canonical("app1"), machine)
        self.assertEqual(self.canonical("app1-root"), machine)
        self.assertEqual(self.canonical("app1.example.com"), machine)

    def test_different_machines_stay_different(self):
        self.assertNotEqual(self.canonical("other"), self.canonical("app1"))

    def test_unknown_name_resolves_to_itself(self):
        self.assertEqual(self.canonical("no-such-box"), "no-such-box")


class CanonicalHostFailures(unittest.TestCase):
    """Any failure returns the name unchanged: the strict direction."""

    @classmethod
    def setUpClass(cls):
        cls.pin = load_pin()

    def test_empty_name(self):
        self.assertEqual(self.pin.canonical_host(""), "")

    def test_ssh_missing(self):
        with mock.patch.object(self.pin.subprocess, "run", side_effect=FileNotFoundError):
            self.assertEqual(self.pin.canonical_host("app1"), "app1")

    def test_ssh_timeout(self):
        err = subprocess.TimeoutExpired("ssh", 5)
        with mock.patch.object(self.pin.subprocess, "run", side_effect=err):
            self.assertEqual(self.pin.canonical_host("app1"), "app1")

    def test_output_without_hostname_line(self):
        done = subprocess.CompletedProcess([], 0, stdout="user deploy\nport 22\n")
        with mock.patch.object(self.pin.subprocess, "run", return_value=done):
            self.assertEqual(self.pin.canonical_host("app1"), "app1")


class PinnedCanonical(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pin = load_pin()

    def setUp(self):
        self.state = tempfile.mkdtemp()
        patcher = mock.patch.object(self.pin, "state_dir", return_value=self.state)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(shutil.rmtree, self.state, True)
        os.makedirs(self.pin.pin_dir())

    def write(self, session, text):
        with open(self.pin.pin_path(session), "w") as fh:
            fh.write(text)

    def test_recorded_canonical_wins_without_resolving(self):
        self.write("s1", "host=app1\ncanonical=app1.example.com\n")
        with mock.patch.object(self.pin, "canonical_host", side_effect=AssertionError):
            self.assertEqual(self.pin.pinned_canonical("s1"), "app1.example.com")
        self.assertEqual(self.pin.pinned_host("s1"), "app1")

    def test_old_pin_file_without_canonical_is_resolved(self):
        self.write("s2", "host=app1\nproject=/p\n")
        with mock.patch.object(self.pin, "canonical_host", return_value="app1.example.com") as m:
            self.assertEqual(self.pin.pinned_canonical("s2"), "app1.example.com")
        m.assert_called_once_with("app1")

    def test_no_pin(self):
        self.assertIsNone(self.pin.pinned_canonical("missing"))
        self.assertIsNone(self.pin.pinned_canonical(""))


class HostPatterns(unittest.TestCase):
    """ssh_config_host_patterns follows Include and drops non-names."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def path(self, name):
        return os.path.join(self.tmp, name)

    def write(self, name, text):
        with open(self.path(name), "w") as fh:
            fh.write(text)

    def patterns(self, name):
        script = '. "$1/ssh_common.sh"; ssh_config_host_patterns "$2"'
        out = subprocess.run(
            ["bash", "-c", script, "_", LIB, self.path(name)],
            capture_output=True, text=True, cwd=self.tmp, timeout=20,
        )
        return sorted(out.stdout.split())

    def test_follows_include_and_drops_wildcards_and_negations(self):
        self.write("child", "Host web1 web2\nHost *.internal !bad\n")
        self.write("main", "Host app1\nInclude %s\nHost *\n" % self.path("child"))
        self.assertEqual(self.patterns("main"), ["app1", "web1", "web2"])

    def test_star_does_not_glob_against_working_directory(self):
        self.write("stray-file", "")
        self.write("main", "Host *\n")
        self.assertEqual(self.patterns("main"), [])

    def test_include_glob(self):
        os.makedirs(self.path("conf.d"))
        self.write("conf.d/a", "Host alpha\n")
        self.write("conf.d/b", "Host beta\n")
        self.write("main", "Include %s/*\n" % self.path("conf.d"))
        self.assertEqual(self.patterns("main"), ["alpha", "beta"])

    def test_self_include_terminates(self):
        self.write("main", "Host loop\nInclude %s\n" % self.path("main"))
        self.assertEqual(set(self.patterns("main")), {"loop"})


if __name__ == "__main__":
    unittest.main()
