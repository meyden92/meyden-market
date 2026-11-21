#!/usr/bin/env node
// PostToolUse Write|Edit|MultiEdit: remind to resync scenes.json after SCRIPT.md changes.
import { addContext, readEvent } from "./_lib.mjs";

const ev = readEvent();
const p = ev?.tool_input?.file_path;
if (typeof p !== "string") process.exit(0);
const m = p.replace(/\\/g, "/").match(/(?:^|\/)videos\/([^/]+)\/SCRIPT\.md$/);
if (!m) process.exit(0);
addContext(
  `videos/${m[1]}/SCRIPT.md changed. scenes.json is not updated until the run skill runs for ${m[1]}; run it so scenes.json resyncs.`,
);
