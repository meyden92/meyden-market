# Changelog

## 0.1.0

- Split out of `tools` 0.7.0, which is gone; its history is in git. The github skill moves here
  as `github-flow:github`. The executable is now `meyden-gh <verb>` instead of
  `meyden github <verb>`, project rules are read from `.claude/skill-context/github-flow/`
  instead of `.claude/skill-context/tools/`, and the check that denies PR text with a closing
  keyword is now this plugin's own `pr_guard.py` hook instead of part of the SSH guard.
