#!/usr/bin/env node
// Validates videos/<slug>/scenes.json against templates/scenes.schema.json.
// Run with cwd = the Remotion project root. Usage: validate-manifest.mjs <slug>
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const slug = process.argv[2];
if (!slug) {
  console.error("usage: validate-manifest.mjs <slug>");
  process.exit(1);
}

const load = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`validate-manifest: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
};

const schema = load(join(dirname(fileURLToPath(import.meta.url)), "..", "templates", "scenes.schema.json"));
const data = load(join("videos", slug, "scenes.json"));

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const isType = (v, t) => (t === "number" ? typeof v === "number" : typeOf(v) === t);

const errors = [];
const check = (value, s, path) => {
  if (s.type) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => isType(value, t))) {
      errors.push(`${path}: expected ${types.join(" or ")}, got ${typeOf(value)}`);
      return;
    }
  }
  if (s.enum && !s.enum.includes(value)) errors.push(`${path}: must be one of ${s.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  if (typeof value === "string" && s.pattern && !new RegExp(s.pattern).test(value)) errors.push(`${path}: does not match ${s.pattern}`);
  if (typeof value === "number" && s.minimum !== undefined && value < s.minimum) errors.push(`${path}: must be >= ${s.minimum}`);
  if (Array.isArray(value)) {
    if (s.minItems !== undefined && value.length < s.minItems) errors.push(`${path}: needs at least ${s.minItems} item(s)`);
    if (s.maxItems !== undefined && value.length > s.maxItems) errors.push(`${path}: allows at most ${s.maxItems} item(s)`);
    if (s.items) value.forEach((v, i) => check(v, s.items, `${path}[${i}]`));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of s.required ?? []) if (!(key in value)) errors.push(`${path}.${key}: required`);
    for (const [key, v] of Object.entries(value)) {
      if (s.properties?.[key]) check(v, s.properties[key], `${path}.${key}`);
      else if (s.additionalProperties === false) errors.push(`${path}.${key}: unknown property`);
    }
  }
};

check(data, schema, "$");

// Capture and tutorial steps: rules the schema cannot express.
const CAPTURE_ACTIONS = ["goto", "click", "fill", "type", "hover", "press", "scroll", "wait"];
const STEP_ACTIONS = ["move", "click", "type", "highlight", "zoom", "unzoom", "callout", "badge", "clear"];
const RECORDED_ACTIONS = ["move", "click", "type"];
function checkTutorial(s, path) {
  const c = s.capture;
  if (s.visualType === "screencast" && !c) errors.push(`${path}: a screencast scene needs a capture`);
  if (c) {
    if (!["screenshot", "screencast"].includes(s.visualType)) errors.push(`${path}.capture: only screenshot and screencast scenes have a capture`);
    if (c.record !== (s.visualType === "screencast")) errors.push(`${path}.capture.record: must be ${s.visualType === "screencast"} for a ${s.visualType} scene`);
    const file = c.record ? `public/video/${s.id}-${c.shot}.webm` : `public/img/${s.id}-${c.shot}.png`;
    const layer = c.record ? "screencast" : "screenshot";
    if (!s.assets?.some((a) => a.file === file && a.layer === layer)) errors.push(`${path}.assets: needs ${file} (${layer}) for the capture`);
    (c.steps ?? []).forEach((st, j) => {
      const keys = Object.keys(st).filter((k) => CAPTURE_ACTIONS.includes(k));
      if (keys.length !== 1) errors.push(`${path}.capture.steps[${j}]: needs exactly one of ${CAPTURE_ACTIONS.join(", ")}`);
      if ("fill" in st && !("value" in st)) errors.push(`${path}.capture.steps[${j}]: fill needs value`);
      if ("type" in st && typeof st.text !== "string") errors.push(`${path}.capture.steps[${j}]: type needs text`);
    });
    for (const [k, v] of Object.entries(c.targets ?? {})) if (typeof v !== "string" || !v) errors.push(`${path}.capture.targets.${k}: must be a selector string`);
  }
  const steps = s.data?.steps;
  if (steps === undefined) return;
  if (!Array.isArray(steps)) return errors.push(`${path}.data.steps: must be an array`);
  if (!c) errors.push(`${path}.data.steps: steps need a capture for their target boxes`);
  if (!data.meta?.style?.tutorial) errors.push(`${path}.data.steps: steps need meta.style.tutorial`);
  const names = new Set([...Object.keys(c?.targets ?? {}), ...(c?.steps ?? []).map((st) => st.as).filter(Boolean)]);
  steps.forEach((st, j) => {
    const p = `${path}.data.steps[${j}]`;
    const at = st?.at;
    const okAt = (typeof at === "number" && at >= 0) || (at && typeof at.word === "string" && at.word && (at.n === undefined || (Number.isInteger(at.n) && at.n >= 1)));
    if (!okAt) errors.push(`${p}.at: seconds >= 0 or {"word": "<spoken word>", "n": <occurrence>}`);
    if (!STEP_ACTIONS.includes(st?.action)) errors.push(`${p}.action: must be one of ${STEP_ACTIONS.join(", ")}`);
    if (s.visualType === "screencast" && RECORDED_ACTIONS.includes(st?.action))
      errors.push(`${p}.action: ${st.action} comes from the recording in a screencast; use highlight, zoom, unzoom, callout, badge or clear`);
    const needsTarget = !["unzoom", "clear"].includes(st?.action);
    if (needsTarget && !names.has(st?.target)) errors.push(`${p}.target: must name a capture target (${[...names].join(", ") || "none defined"})`);
    if (["callout", "type"].includes(st?.action) && typeof st?.text !== "string") errors.push(`${p}.text: ${st.action} needs text`);
  });
}

if (Array.isArray(data.scenes)) {
  const seen = new Set();
  data.scenes.forEach((s, i) => {
    if (seen.has(s.id)) errors.push(`$.scenes[${i}].id: duplicate id ${s.id}`);
    seen.add(s.id);
    checkTutorial(s, `$.scenes[${i}]`);
  });
}

if (errors.length) {
  console.error(`validate-manifest: ${slug}: ${errors.length} error(s)`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`validate-manifest: ${slug}: ok (${data.scenes.length} scenes)`);
