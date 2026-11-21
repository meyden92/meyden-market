# Changelog

## 0.1.0

- Split out of `tools` 0.7.0, which is gone; its history is in git. Its github skill moved to
  `github-flow`, its powerpoint skill was dropped. The SSH skill, the session
  pin and the guard hook move here unchanged. The executable is now `meyden-ssh <verb>` instead
  of `meyden ssh <verb>`, and project rules are read from
  `.claude/skill-context/remote-ssh/` instead of `.claude/skill-context/tools/`.
