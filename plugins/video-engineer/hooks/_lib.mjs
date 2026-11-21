// Shared helpers for the video-engineer hooks. Node stdlib only.
import { readFileSync } from "node:fs";

export const readEvent = () => {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
};

export const deny = (reason) => {
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
    }),
  );
  process.exit(0);
};

export const addContext = (additionalContext) => {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext } }));
  process.exit(0);
};

