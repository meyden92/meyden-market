#!/usr/bin/env python3
"""Validate a Claude Code skill directory against the current spec.

Usage: validate_skill.py <skill-dir> [<skill-dir> ...]

Checks frontmatter fields, argument placeholders, file references, and
structure per https://code.claude.com/docs/en/skills (v2.1.220).
Stdlib-only. Exit code 1 if any ERROR was found, else 0.
"""

import os
import re
import sys

KNOWN_FIELDS = {
    "name", "description", "when_to_use", "argument-hint", "arguments",
    "disable-model-invocation", "user-invocable", "allowed-tools",
    "disallowed-tools", "model", "effort", "context", "agent", "background",
    "hooks", "paths", "shell",
}
# Fields from the agentskills.io standard / other products that Claude Code ignores.
FOREIGN_FIELDS = {"version", "license", "metadata", "compatibility", "allowed-directories"}
BOOL_FIELDS = {"disable-model-invocation", "user-invocable", "background"}
BOOL_VALUES = {"true", "false", "yes", "no", "on", "off", "1", "0"}
EFFORT_VALUES = {"low", "medium", "high", "xhigh", "max"}
DESC_CAP = 1536
BODY_LINE_GUIDELINE = 500


def parse_frontmatter(text):
    """Parse the limited YAML subset used in skill frontmatter.

    Returns (fields: dict[str, str|list], body: str, error: str|None).
    Handles `key: value`, block lists, flow lists, and indented continuations.
    """
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return {}, text, "no frontmatter block (file must start with ---)"
    fields = {}
    current_key = None
    end = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end = i
            break
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line[0] not in " \t":
            m = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
            if not m:
                return fields, text, f"unparseable frontmatter line {i + 1}: {line.strip()!r}"
            current_key = m.group(1)
            val = m.group(2).strip()
            if val.startswith("[") and val.endswith("]"):
                fields[current_key] = [v.strip().strip("'\"") for v in val[1:-1].split(",") if v.strip()]
            else:
                fields[current_key] = val.strip("'\"") if val else ""
        else:
            stripped = line.strip()
            if current_key is None:
                return fields, text, f"indented frontmatter line {i + 1} with no key"
            if stripped.startswith("- "):
                if not isinstance(fields[current_key], list):
                    fields[current_key] = []
                fields[current_key].append(stripped[2:].strip().strip("'\""))
            elif isinstance(fields[current_key], str):
                fields[current_key] = (fields[current_key] + " " + stripped).strip()
    if end is None:
        return fields, text, "frontmatter never closed (missing second ---)"
    return fields, "\n".join(lines[end + 1:]), None


def check_frontmatter_yaml(text):
    """Strict-parity check against the real YAML loader.

    parse_frontmatter above is deliberately permissive, so a slightly-malformed
    skill still yields useful findings. Claude Code loads frontmatter with a
    real YAML parser, which is stricter, and frontmatter that fails there
    loads as EMPTY metadata, so the skill silently never triggers and nothing
    reports an error. A validator that is laxer than the real loader hides
    exactly that failure, so anything caught here is an error, not a warning.
    """
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return []
    end = next((i for i, l in enumerate(lines[1:], start=1) if l.strip() == "---"), None)
    if end is None:
        return []
    fm_lines = lines[1:end]

    # Checked against the constructs that actually break plain scalars, rather
    # than by loading a real YAML parser: pyyaml is not stdlib, and a validator
    # whose verdict depends on what happens to be installed passes a skill on
    # one machine and fails it on the next.
    problems = []
    for offset, line in enumerate(fm_lines):
        lineno = offset + 2  # 1-based, and line 1 is the opening ---
        if "\t" in line:
            problems.append(f"line {lineno}: tab character; YAML forbids tabs in indentation")
        m = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        # Quoted, block, flow, anchor and tag values follow different rules.
        if not val or val[0] in "\"'|>[{&*!":
            continue
        if re.search(r":(\s|$)", val):
            problems.append(
                f"line {lineno}: `{key}` value contains an unquoted ': ': a real YAML "
                f"parser reads that as a nested mapping and rejects the whole file, so "
                f"the skill would load with no metadata and never trigger. Quote the value.")
        if " #" in val:
            problems.append(
                f"line {lineno}: `{key}` value contains an unquoted ' #': YAML treats the "
                f"rest of the line as a comment and silently drops it. Quote the value.")
    return problems


def as_list(value):
    if isinstance(value, list):
        return value
    return [v for v in re.split(r"[,\s]+", value) if v]


def strip_code_blocks(body):
    """Remove fenced code blocks so example snippets don't trigger reference checks."""
    return re.sub(r"```.*?```", "", body, flags=re.S)


def validate(skill_dir):
    errors, warnings, infos = [], [], []
    skill_dir = os.path.abspath(skill_dir)
    dir_name = os.path.basename(skill_dir.rstrip("/"))
    skill_md = os.path.join(skill_dir, "SKILL.md")

    if not os.path.isfile(skill_md):
        return [f"no SKILL.md in {skill_dir}"], [], []

    with open(skill_md, encoding="utf-8") as f:
        text = f.read()
    fields, body, parse_err = parse_frontmatter(text)
    if parse_err:
        errors.append(f"frontmatter: {parse_err}; Claude Code would load the body with EMPTY metadata (no description to trigger on)")
    for problem in check_frontmatter_yaml(text):
        errors.append(f"frontmatter: {problem}")

    # --- field-level checks ---
    for key in fields:
        if key not in KNOWN_FIELDS:
            if key in FOREIGN_FIELDS:
                infos.append(f"field '{key}' is from the agentskills.io standard/other products; Claude Code ignores it")
            else:
                warnings.append(f"unknown frontmatter field '{key}': typo? Known: {', '.join(sorted(KNOWN_FIELDS))}")

    for key in BOOL_FIELDS & set(fields):
        val = str(fields[key]).lower()
        if val not in BOOL_VALUES:
            errors.append(f"'{key}: {fields[key]}' is not a valid boolean (true/false/yes/no/on/off/1/0)")
        elif val not in ("true", "false"):
            infos.append(f"'{key}: {fields[key]}' works (≥v2.1.218) but 'true'/'false' is more portable")

    desc = str(fields.get("description", ""))
    wtu = str(fields.get("when_to_use", ""))
    if not desc:
        warnings.append("no 'description', so Claude can't decide when to auto-load this skill (falls back to first body paragraph)")
    combined = len(desc) + len(wtu)
    if combined > DESC_CAP:
        warnings.append(f"description + when_to_use is {combined} chars; listing truncates at {DESC_CAP}: put the key use case first or trim")

    name = str(fields.get("name", ""))
    if name:
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", name):
            warnings.append(f"name '{name}' should be lowercase words separated by hyphens")
        if name != dir_name:
            infos.append(f"name '{name}' differs from directory '{dir_name}': the command is /{dir_name} (name is display-only outside plugins)")

    if "effort" in fields and str(fields["effort"]) not in EFFORT_VALUES:
        errors.append(f"'effort: {fields['effort']}' invalid: one of {', '.join(sorted(EFFORT_VALUES))}")
    if "shell" in fields and str(fields["shell"]) not in ("bash", "powershell"):
        errors.append(f"'shell: {fields['shell']}' invalid: 'bash' or 'powershell'")
    if "context" in fields and str(fields["context"]) != "fork":
        errors.append(f"'context: {fields['context']}' invalid: only 'fork' is supported")

    is_fork = str(fields.get("context", "")) == "fork"
    if "agent" in fields and not is_fork:
        warnings.append("'agent' has no effect without 'context: fork'")
    if "background" in fields and not is_fork:
        warnings.append("'background' has no effect without 'context: fork'")
    if is_fork and len(body.split()) < 20:
        warnings.append("'context: fork' with a near-empty body: the body becomes the subagent's entire prompt; it needs explicit task instructions")

    # --- allowed/disallowed-tools sanity ---
    for key in ("allowed-tools", "disallowed-tools"):
        if key in fields:
            raw = fields[key] if isinstance(fields[key], str) else " ".join(fields[key])
            if raw.count("(") != raw.count(")"):
                errors.append(f"'{key}' has unbalanced parentheses: {raw!r}")
            for m in re.finditer(r"Bash\(([^)]*)\)", raw):
                rule = m.group(1)
                if skill_dir in rule:
                    warnings.append(f"'{key}' hardcodes the install path; use ${{CLAUDE_SKILL_DIR}} so it survives moves: {rule!r}")

    # --- argument placeholder consistency ---
    declared = [a for a in as_list(fields.get("arguments", ""))]
    body_no_code = strip_code_blocks(body)
    named_used = set(re.findall(r"(?<!\\)\$([a-zA-Z_][a-zA-Z0-9_]*)", body_no_code))
    named_used -= {"ARGUMENTS", "CLAUDE_SKILL_DIR", "CLAUDE_PROJECT_DIR", "CLAUDE_SESSION_ID", "CLAUDE_EFFORT"}
    # $name placeholders only substitute when declared in `arguments:`
    undeclared = sorted(n for n in named_used if n not in declared and not n.isupper())
    if undeclared:
        warnings.append(f"body uses ${{...}}-style named placeholders not declared in 'arguments': {', '.join('$' + n for n in undeclared)}; they will NOT be substituted (escape literal $ with \\$)")
    unused = sorted(a for a in declared if a not in named_used)
    if unused:
        warnings.append(f"'arguments' declares {', '.join(unused)} but the body never uses them")
    uses_args = bool(declared) or "$ARGUMENTS" in body_no_code or re.search(r"(?<!\\)\$\d", body_no_code)
    if uses_args and "argument-hint" not in fields:
        infos.append("skill takes arguments but has no 'argument-hint': add one so autocomplete shows what to pass")
    hint = str(fields.get("argument-hint", ""))
    if hint and not hint.startswith("["):
        infos.append(f"argument-hint {hint!r}: conventional format is bracketed, e.g. [issue-number]")

    # --- file reference checks ---
    seen = set()
    for m in re.finditer(r"\[[^\]]*\]\(([^)#\s]+)\)", body):
        ref = m.group(1)
        if ref.startswith(("http://", "https://", "mailto:")) or ref in seen:
            continue
        seen.add(ref)
        if not os.path.exists(os.path.join(skill_dir, ref)):
            errors.append(f"body links to missing file: {ref}")
    for m in re.finditer(r"\$\{CLAUDE_SKILL_DIR\}/([A-Za-z0-9_./-]+)", body):
        ref = m.group(1).rstrip(".")
        if ref in seen or ref.endswith("/"):  # bare directory mention in prose, not a file ref
            continue
        seen.add(ref)
        path = os.path.join(skill_dir, ref)
        if not os.path.exists(path):
            errors.append(f"body references missing bundled file: ${{CLAUDE_SKILL_DIR}}/{ref}")
        elif ref.endswith((".sh", ".bash")) and not os.access(path, os.X_OK):
            warnings.append(f"referenced script is not executable (chmod +x): {ref}")

    # --- dynamic context injection ---
    # The preprocessor is character-based and ignores markdown code spans:
    # any !`cmd` at line start or after whitespace EXECUTES on every invocation.
    active = [m.group(1) for m in re.finditer(r"(?:^|\s)!`([^`\n]+)`", body, re.M)]
    fence_blocks = len(re.findall(r"^```!\s*$", body, re.M))
    if active:
        infos.append(
            f"{len(active)} dynamic-context command(s) run on EVERY invocation: "
            + "; ".join(f"!`{c}`" for c in active[:5])
            + (" …" if len(active) > 5 else "")
            + "; confirm each is intentional and available on target machines; to merely mention the syntax, put a non-space char directly before the !"
        )
    if fence_blocks:
        infos.append(f"{fence_blocks} multi-line ```! block(s) execute on every invocation: confirm intentional")

    # --- structure ---
    body_lines = len(body.rstrip().split("\n"))
    if body_lines > BODY_LINE_GUIDELINE:
        warnings.append(
            f"SKILL.md body is {body_lines} lines (documented ceiling: {BODY_LINE_GUIDELINE}); "
            f"every invocation pays for this, so disclose branch-specific detail into references/ "
            f"files. This bound is on SKILL.md only: reference files load on demand and should be "
            f"as long as the material needs.")
    # A skill that discloses properly names a script from the reference file
    # that owns it, not from SKILL.md. Walk the markdown links out of SKILL.md
    # transitively (staying inside the skill) and pool the text, so disclosed
    # files count as reachable, and broken links in references get caught.
    reachable = text
    visited = {"SKILL.md"}
    queue = [("SKILL.md", body)]
    while queue:
        origin, content = queue.pop()
        origin_dir = os.path.dirname(origin)
        for m in re.finditer(r"\[[^\]]*\]\(([^)#\s]+)\)", content):
            link = m.group(1)
            if link.startswith(("http://", "https://", "mailto:")):
                continue
            rel = os.path.normpath(os.path.join(origin_dir, link))
            if rel.startswith("..") or rel in visited:
                continue
            path = os.path.join(skill_dir, rel)
            if not os.path.isfile(path):
                if origin != "SKILL.md":  # SKILL.md links are already an error above
                    warnings.append(f"{origin} links to missing file: {link}")
                continue
            visited.add(rel)
            if not rel.endswith(".md"):
                continue
            try:
                with open(path, encoding="utf-8") as fh:
                    linked = fh.read()
            except OSError:
                continue
            reachable += "\n" + linked
            queue.append((rel, linked))

    for sub in ("scripts", "references", "assets", "prompts"):
        subdir = os.path.join(skill_dir, sub)
        if os.path.isdir(subdir):
            for fn in sorted(os.listdir(subdir)):
                rel = f"{sub}/{fn}"
                if fn.startswith(".") or fn in ("__init__.py", "__pycache__"):
                    continue
                module_form = f"{sub}.{os.path.splitext(fn)[0]}"  # python3 -m scripts.run_loop
                if rel not in reachable and fn not in reachable and module_form not in reachable:
                    infos.append(
                        f"bundled file unreachable from SKILL.md or any reference it links: "
                        f"{rel}: Claude may not discover it")

    return errors, warnings, infos


def main(argv):
    if len(argv) < 2:
        print((__doc__ or "").strip())
        return 2
    any_errors = False
    for skill_dir in argv[1:]:
        errors, warnings, infos = validate(skill_dir)
        label = os.path.basename(os.path.abspath(skill_dir).rstrip("/"))
        print(f"== {label} ==")
        for e in errors:
            print(f"  ERROR: {e}")
        for w in warnings:
            print(f"  WARN:  {w}")
        for i in infos:
            print(f"  INFO:  {i}")
        if not (errors or warnings or infos):
            print("  OK: no findings")
        else:
            print(f"  {len(errors)} error(s), {len(warnings)} warning(s), {len(infos)} info(s)")
        any_errors |= bool(errors)
    return 1 if any_errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
