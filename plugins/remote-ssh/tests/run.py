#!/usr/bin/env python3
"""Run the remote-ssh plugin test suite: python3 tests/run.py

Standard library only: no gh, no network. Anything that needs a GitHub
does not belong here.
"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
suite = unittest.defaultTestLoader.discover(HERE, pattern="test_*.py")
sys.exit(0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1)
