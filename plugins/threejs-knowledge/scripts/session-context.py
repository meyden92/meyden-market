#!/usr/bin/env python3
"""SessionStart hook: describe the three.js stack of the project to Claude. Silent outside three.js projects."""
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import threelib  # noqa: E402

PACKAGES = [
    ("@react-three/fiber", "React Three Fiber"),
    ("@react-three/drei", "drei"),
    ("@react-three/rapier", "@react-three/rapier"),
    ("@dimforge/rapier3d-compat", "Rapier"),
    ("@dimforge/rapier3d", "Rapier"),
    ("postprocessing", "pmndrs postprocessing"),
    ("@react-three/xr", "@react-three/xr"),
]


def candidates(cwd):
    """The project root plus workspace packages one level down."""
    roots = [cwd]
    for pattern in ("packages/*", "apps/*", "*"):
        for path in sorted(glob.glob(os.path.join(cwd, pattern))):
            if os.path.isfile(os.path.join(path, "package.json")) and os.path.basename(path) not in threelib.SKIP_DIRS:
                roots.append(path)
    return roots


def find_stack(cwd):
    for root in candidates(cwd):
        version = threelib.installed(root, "three")
        if version and os.path.isfile(os.path.join(root, "package.json")):
            manifest = threelib.read_json(os.path.join(root, "package.json")) or {}
            declared = {**(manifest.get("dependencies") or {}), **(manifest.get("devDependencies") or {})}
            if "three" in declared:
                return root, threelib.release_of(version), version
    for pattern in ("*.html", "public/*.html", "src/*.html"):
        for path in sorted(glob.glob(os.path.join(cwd, pattern)))[:20]:
            release = threelib.html_release(threelib.read_text(path))
            if release:
                return cwd, release, "0.%d (import map in %s)" % (release, os.path.relpath(path, cwd))
    return None


def renderer_of(root):
    webgpu = webgl = False
    for path in threelib.source_files(root, cap=600):
        text = threelib.read_text(path, 200_000)
        webgpu = webgpu or bool(re.search(r"WebGPURenderer|three/webgpu", text))
        webgl = webgl or bool(re.search(r"WebGLRenderer|<Canvas\b", text))
        if webgpu and webgl:
            break
    if webgpu and webgl:
        return "WebGLRenderer and WebGPURenderer both appear in the source"
    if webgpu:
        return "WebGPURenderer (TSL node materials; ShaderMaterial and onBeforeCompile do not work)"
    if webgl:
        return "WebGLRenderer"
    return "no renderer in the source yet"


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        payload = {}
    cwd = payload.get("cwd") or os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    stack = find_stack(cwd)
    if not stack:
        return 0
    root, release, version = stack
    lines = ["This is a three.js project (detected by the threejs-knowledge plugin)."]
    where = "" if root == cwd else " in %s" % os.path.relpath(root, cwd)
    if release is None:
        lines.append("- three %s%s." % (version, where))
    elif release < threelib.SKILLS_TARGET:
        lines.append(
            "- three r%d (%s)%s. The threejs-knowledge skills describe r%d: before using an API they name, check that it "
            "exists in node_modules/three at r%d, and keep to the older API where it does not. Upgrading three is the "
            "user's decision; say so when the task needs a newer release." % (release, version, where, threelib.SKILLS_TARGET, release))
    else:
        lines.append("- three r%d (%s)%s." % (release, version, where))
    extras, seen = [], set()
    for name, label in PACKAGES:
        found = threelib.installed(root, name)
        if found and label not in seen:
            seen.add(label)
            extras.append("%s %s" % (label, found))
    if extras:
        lines.append("- Also installed: %s." % ", ".join(extras))
    lines.append("- Renderer: %s." % renderer_of(root))
    lines.append(
        "For any work on 3D code in this project (building, changing, debugging, optimizing, shaders, assets, physics, "
        "XR, audio), load the threejs-knowledge:build skill before writing code. It picks the topic skills and agents and "
        "ends with a visual check. Do not ask the user which skill to use.")
    json.dump({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "\n".join(lines)}}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
