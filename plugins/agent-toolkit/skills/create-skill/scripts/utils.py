"""Shared utilities for skill-creator scripts."""

from pathlib import Path



def parse_skill_md(skill_path: Path) -> tuple[str, str, str, str]:
    """Parse a SKILL.md file, returning (name, description, when_to_use, full_content)."""
    content = (skill_path / "SKILL.md").read_text()
    lines = content.split("\n")

    if lines[0].strip() != "---":
        raise ValueError("SKILL.md missing frontmatter (no opening ---)")

    end_idx = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end_idx = i
            break

    if end_idx is None:
        raise ValueError("SKILL.md missing frontmatter (no closing ---)")

    name = ""
    fields = {"description": "", "when_to_use": ""}
    frontmatter_lines = lines[1:end_idx]
    i = 0
    while i < len(frontmatter_lines):
        line = frontmatter_lines[i]
        key = line.split(":", 1)[0]
        if line.startswith("name:"):
            name = line[len("name:"):].strip().strip('"').strip("'")
        elif key in fields:
            value = line[len(key) + 1:].strip()
            # Handle YAML multiline indicators (>, |, >-, |-)
            if value in (">", "|", ">-", "|-"):
                continuation_lines: list[str] = []
                i += 1
                while i < len(frontmatter_lines) and (frontmatter_lines[i].startswith("  ") or frontmatter_lines[i].startswith("\t")):
                    continuation_lines.append(frontmatter_lines[i].strip())
                    i += 1
                fields[key] = " ".join(continuation_lines)
                continue
            else:
                fields[key] = value.strip('"').strip("'")
        i += 1

    return name, fields["description"], fields["when_to_use"], content
