#!/usr/bin/env node
// Starts the app of a showcase or tutorial video, runs each scene's capture steps in Playwright Chromium
// and writes the screenshots, recordings and target boxes the tutorial scenes draw on.
// Run with cwd = the Remotion project root (playwright is a project dependency).
//   capture.mjs <slug> [--scene <id>] [--force]
//   capture.mjs <slug> --probe        start page only -> public/img/probe.png, public/capture/probe.json
// Inputs:  videos/<slug>/app.json (how to start and reach the app), scenes[].capture in scenes.json.
// Outputs per scene with a capture:
//   screenshot  public/img/<id>-<shot>.png at device scale 2
//   screencast  public/video/<id>-<shot>.webm at the viewport size
//   both        public/capture/<id>.json (CaptureData in lib/scenes/types.ts), public/capture/<id>.sha256
// A scene is skipped while its asset, box file and hash of [app.json, capture] are unchanged.
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

const args = process.argv.slice(2);
const slug = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--scene");
const only = args.includes("--scene") ? args[args.indexOf("--scene") + 1] : undefined;
const force = args.includes("--force");
const probe = args.includes("--probe");
const fail = (msg) => {
  throw new Error(msg);
};
if (!slug) {
  console.error("usage: capture.mjs <slug> [--scene <id>] [--force] | <slug> --probe");
  process.exit(1);
}

const dir = join("videos", slug);
const appPath = join(dir, "app.json");
if (!existsSync(appPath)) {
  console.error(`capture: ${appPath} not found; the interview writes it from the App branch`);
  process.exit(1);
}
const app = JSON.parse(readFileSync(appPath, "utf8"));
const manifestPath = join(dir, "scenes.json");
const manifest = probe ? null : JSON.parse(readFileSync(manifestPath, "utf8"));
const viewport = app.viewport ?? { width: 1440, height: 900 };
const appCwd = app.cwd ? (isAbsolute(app.cwd) ? app.cwd : resolve(app.cwd)) : undefined;

const sha = (s) => createHash("sha256").update(s).digest("hex");
const write = (file, text) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

let playwright;
try {
  playwright = createRequire(join(process.cwd(), "package.json"))("playwright");
} catch {
  console.error("capture: playwright is not installed in this project; run /video-engineer:setup");
  process.exit(1);
}

// ---- the app ----
const reachable = async () => {
  try {
    const res = await fetch(app.url, { redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
};

let server;
const logFile = join(dir, "research", "app.log");
const startApp = async () => {
  if (await reachable()) return console.log(`capture: ${app.url} already answers; using the running app`);
  if (!app.start) fail(`${app.url} does not answer and app.json has no start command`);
  mkdirSync(dirname(logFile), { recursive: true });
  const log = openSync(logFile, "w");
  server = spawn(app.start, { cwd: appCwd, shell: true, detached: true, stdio: ["ignore", log, log], env: { ...process.env, BROWSER: "none" } });
  closeSync(log);
  const deadline = Date.now() + (app.readyTimeoutSec ?? 120) * 1000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) fail(`"${app.start}" exited with code ${server.exitCode}; see ${logFile}`);
    if (await reachable()) return console.log(`capture: started "${app.start}", ${app.url} answers`);
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`${app.url} did not answer within ${app.readyTimeoutSec ?? 120} s after "${app.start}"; see ${logFile}`);
};
const stopApp = () => {
  if (server && server.exitCode === null) process.kill(-server.pid, "SIGTERM");
};

// ---- steps ----
// Fill values never live in scenes.json: a literal for non-secret input, an env var, or a regex on a seed file of the app.
const valueOf = (v) => {
  if (typeof v === "string") return v;
  if (v?.env) return process.env[v.env] ?? fail(`environment variable ${v.env} is not set`);
  if (v?.file) {
    const file = isAbsolute(v.file) ? v.file : join(appCwd ?? ".", v.file);
    if (!existsSync(file)) fail(`seed file ${file} not found`);
    const m = readFileSync(file, "utf8").match(new RegExp(v.match));
    return m?.[1] ?? fail(`"${v.match}" has no match with a group in ${file}`);
  }
  fail(`unsupported value ${JSON.stringify(v)}`);
};

const ACTIONS = ["goto", "click", "fill", "type", "hover", "press", "scroll", "wait"];
const visible = async (page, selector) => {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: "visible", timeout: 15000 }).catch(() => fail(`selector not visible within 15 s: ${selector}`));
  return loc;
};
const scaled = (b, k) => ({ x: Math.round(b.x * k), y: Math.round(b.y * k), w: Math.round(b.width * k), h: Math.round(b.height * k) });

/** Runs steps on a page. With `rec`, paces them for a recording and logs move, click and type events. */
const runSteps = async (page, steps, rec) => {
  for (const st of steps) {
    const action = ACTIONS.find((a) => a in st) ?? fail(`step without action: ${JSON.stringify(st)}`);
    const target = st.as ?? st[action];
    const event = async (kind, loc, text) => {
      if (!rec) return;
      const box = (await loc.boundingBox()) ?? fail(`no box for ${target}`);
      rec.events.push({ t: (Date.now() - rec.t0) / 1000, action: kind, target, box: scaled(box, 1), ...(text ? { text } : {}) });
    };
    if (action === "goto") {
      await page.goto(new URL(st.goto, app.url).href, { waitUntil: "networkidle" });
    } else if (action === "click") {
      const loc = await visible(page, st.click);
      if (rec) {
        await event("move", loc);
        await loc.hover();
        await page.waitForTimeout(600);
      }
      await event("click", loc);
      await loc.click();
      await page.waitForLoadState("networkidle");
      if (rec) await page.waitForTimeout(800);
    } else if (action === "fill" || action === "type") {
      const loc = await visible(page, st[action]);
      const text = action === "fill" ? valueOf(st.value) : st.text;
      await event("type", loc, action === "type" ? text : undefined);
      if (rec || action === "type") {
        await loc.click();
        await loc.pressSequentially(text, { delay: 60 });
      } else await loc.fill(text);
      if (rec) await page.waitForTimeout(500);
    } else if (action === "hover") {
      const loc = await visible(page, st.hover);
      await event("move", loc);
      await loc.hover();
      if (rec) await page.waitForTimeout(700);
    } else if (action === "press") {
      await page.keyboard.press(st.press);
      await page.waitForLoadState("networkidle");
      if (rec) await page.waitForTimeout(600);
    } else if (action === "scroll") {
      await (await visible(page, st.scroll)).scrollIntoViewIfNeeded();
      await page.waitForTimeout(rec ? 800 : 300);
    } else if (action === "wait") {
      if (typeof st.wait === "number") await page.waitForTimeout(st.wait);
      else await visible(page, st.wait);
    }
  }
};

// Hidden areas (personal data, dev banners, toasts) are blanked with CSS before any page script runs.
const hideCss = (app.hide ?? []).map((sel) => `${sel}{visibility:hidden !important}`).join("\n");
const prepare = async (context) => {
  if (hideCss)
    await context.addInitScript((css) => {
      const add = () => {
        const s = document.createElement("style");
        s.textContent = css;
        document.documentElement.appendChild(s);
      };
      if (document.documentElement) add();
      else document.addEventListener("DOMContentLoaded", add);
    }, hideCss);
};
const checkHidden = async (page) => {
  for (const sel of app.hide ?? []) {
    const shown = await page.locator(sel).evaluateAll((els) => els.filter((e) => getComputedStyle(e).visibility !== "hidden").length);
    if (shown) fail(`hidden area still visible: ${sel}`);
  }
};

const contextOptions = (extra) => ({ viewport, colorScheme: app.colorScheme ?? "light", reducedMotion: "no-preference", ...extra });

// ---- run ----
const browser = await playwright.chromium.launch();
let code = 0;
try {
  await startApp();

  // Log in once and reuse the session for every shot.
  let storageState;
  if (app.login?.length) {
    const context = await browser.newContext(contextOptions());
    await prepare(context);
    const page = await context.newPage();
    await page.goto(app.url, { waitUntil: "networkidle" });
    await runSteps(page, app.login, null);
    storageState = await context.storageState();
    await context.close();
  }

  if (probe) {
    const context = await browser.newContext(contextOptions({ deviceScaleFactor: 2, storageState }));
    await prepare(context);
    const page = await context.newPage();
    await page.goto(app.url, { waitUntil: "networkidle" });
    await checkHidden(page);
    const png = join("public", "img", "probe.png");
    mkdirSync(dirname(png), { recursive: true });
    await page.screenshot({ path: png, animations: "disabled", caret: "hide" });
    // Up to three visible controls of a usable size give the style stills something to point at.
    const targets = {};
    for (const loc of await page.locator("button, a[href], [role=button], input").all()) {
      if (Object.keys(targets).length === 3) break;
      const b = await loc.boundingBox();
      if (b && b.width * b.height >= 600 && b.y + b.height <= viewport.height) targets[`t${Object.keys(targets).length + 1}`] = scaled(b, 2);
    }
    if (!Object.keys(targets).length) fail("no visible control on the start page to point the probe at");
    write(join("public", "capture", "probe.json"), JSON.stringify({ width: viewport.width * 2, height: viewport.height * 2, targets, styles: {}, events: [] }, null, 2) + "\n");
    await context.close();
    console.log(`capture: probe written: ${png}, public/capture/probe.json (${Object.keys(targets).join(", ")})`);
  } else {
    const scenes = manifest.scenes.filter((s) => s.capture && (!only || s.id === only));
    if (only && !scenes.length) fail(`no scene ${only} with a capture`);
    for (const s of scenes) {
      const c = s.capture;
      const asset = c.record ? join("public", "video", `${s.id}-${c.shot}.webm`) : join("public", "img", `${s.id}-${c.shot}.png`);
      const boxes = join("public", "capture", `${s.id}.json`);
      const sidecar = join("public", "capture", `${s.id}.sha256`);
      const hash = sha(JSON.stringify([app, c]));
      if (!force && existsSync(asset) && existsSync(boxes) && existsSync(sidecar) && readFileSync(sidecar, "utf8").trim() === hash) {
        console.log(`${s.id}: up to date`);
        continue;
      }
      const scale = c.record ? 1 : 2;
      const videoDir = c.record ? mkdtempSync(join(tmpdir(), "ve-capture-")) : undefined;
      const context = await browser.newContext(
        contextOptions({ deviceScaleFactor: scale, storageState, ...(c.record ? { recordVideo: { dir: videoDir, size: viewport } } : {}) }),
      );
      await prepare(context);
      const page = await context.newPage();
      const pageStart = Date.now();
      await page.goto(app.url, { waitUntil: "networkidle" });
      const rec = c.record ? { t0: Date.now(), events: [] } : null;
      await runSteps(page, c.steps, rec);
      await page.waitForTimeout(c.record ? 800 : 300);
      await checkHidden(page);
      const targets = {};
      const styles = {};
      for (const [name, sel] of Object.entries(c.targets)) {
        const loc = await visible(page, sel);
        const b = await loc.boundingBox();
        targets[name] = scaled(b ?? fail(`${s.id}: no box for target ${name} (${sel})`), scale);
        styles[name] = await loc.evaluate((e, k) => {
          const cs = getComputedStyle(e);
          // The colour behind the text: the first ancestor with an opaque background.
          let bg = "rgb(255, 255, 255)";
          for (let n = e; n; n = n.parentElement) {
            const c = getComputedStyle(n).backgroundColor;
            if (c !== "transparent" && !/rgba\(.*,\s*0\)$/.test(c)) {
              bg = c;
              break;
            }
          }
          return { fontPx: parseFloat(cs.fontSize) * k, color: cs.color, background: bg };
        }, scale);
      }
      const data = { width: viewport.width * scale, height: viewport.height * scale, targets, styles, events: rec?.events ?? [] };
      if (c.record) {
        data.startSec = (rec.t0 - pageStart) / 1000;
        data.durationSec = (Date.now() - rec.t0) / 1000;
        const video = page.video();
        await context.close();
        mkdirSync(dirname(asset), { recursive: true });
        copyFileSync(await video.path(), asset);
        rmSync(videoDir, { recursive: true, force: true });
      } else {
        mkdirSync(dirname(asset), { recursive: true });
        await page.screenshot({ path: asset, animations: "disabled", caret: "hide" });
        await context.close();
      }
      write(boxes, JSON.stringify(data, null, 2) + "\n");
      write(sidecar, hash + "\n");
      const a = s.assets.find((x) => x.file === asset.split("\\").join("/"));
      if (a) a.status = "delivered";
      console.log(`${s.id}: wrote ${asset} and ${boxes} (${Object.keys(targets).length} targets, ${data.events.length} events)`);
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }
} catch (e) {
  console.error(`capture: ${e.message}`);
  code = 1;
} finally {
  await browser.close();
  stopApp();
}
process.exit(code);
