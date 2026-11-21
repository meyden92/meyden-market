#!/usr/bin/env node
// Audio files of a video-engineer video: narration, sound effects, music and lyric alignment. Node stdlib only.
// It never calls a paid API. Claude generates the audio through the fal MCP (or the ElevenLabs MCP for
// narration); `plan` prints each call still needed as one JSON line, `save` downloads what came back.
// Run with cwd = the Remotion project root.
//   audio.mjs plan <slug> tts [--scene <id>] [--force]           narration calls still needed
//   audio.mjs plan <slug> sfx [--duration <0.5-30>] [--loop] [--force] [--data <dir>]
//                                                                copies library sounds, prints effects to generate
//   audio.mjs plan <slug> music [--force]                        the music call, if one is needed
//   audio.mjs plan <slug> align --audio <file> [--force]         lyrics text to align, or "up to date"
//   audio.mjs save <slug> tts <scene> --url <url>                < word timings (JSON) on stdin
//   audio.mjs save <slug> sfx <scene>:<index>|ui-click|ui-type --url <url>
//   audio.mjs save <slug> music --url <url>
//   audio.mjs save <slug> align --audio <file>                   < {"words": [...], "loss": n} on stdin
//   audio.mjs pace <slug> --voice "<provider, model, voice, style>"  < word timings of a sample on stdin
//   audio.mjs fetch <url> <dest.mp3>                             download one file, converted to mp3
//   audio.mjs fail <slug> "<what failed and why>"                log a soft failure to research/decisions.md
// Word timings on stdin: the `words` array of a Scribe result (spacing entries are dropped), an object with a
// `words` key, or [text, start, end] triples. Seconds from the start of the file.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { findSound, useSound } from "./sfx-library.mjs";

const SCRIBE = "fal-ai/elevenlabs/speech-to-text/scribe-v2";
const SFX_MODEL = "elevenlabs/sound-effects/v3";
const MUSIC_MODEL = "elevenlabs/music/v2.5";
const ALIGN_MODEL = "fal-ai/elevenlabs/forced-alignment";

const [cmd, ...argv] = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const positional = argv.filter((a, i) => !a.startsWith("--") && !(argv[i - 1]?.startsWith("--") && !["--force", "--loop"].includes(argv[i - 1])));

const die = (msg, code = 1) => {
  console.error(`audio: ${msg}`);
  process.exit(code);
};
const sha = (s) => createHash("sha256").update(s).digest("hex");
const write = (file, data) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
};
const line = (o) => console.log(JSON.stringify(o));
const upToDate = (file, sidecar, hash) => existsSync(file) && existsSync(sidecar) && readFileSync(sidecar, "utf8").trim() === hash;
const sidecarOf = (file) => file.replace(/\.mp3$/, ".txt.sha256");

const logDecision = (slug, text) => {
  const file = join("videos", slug, "research", "decisions.md");
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `- ${new Date().toISOString().slice(0, 10)} ${text}\n`);
};

const load = (slug) => {
  const file = join("videos", slug, "scenes.json");
  if (!existsSync(file)) die(`missing ${file}; run from the Remotion project root`);
  return JSON.parse(readFileSync(file, "utf8"));
};

const readStdinJson = () => {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch (e) {
    die(`expected JSON on stdin (${e.message})`);
  }
};

// Word timings in any of the accepted shapes -> [{text, start, end}].
const wordsFrom = (input) => {
  const list = Array.isArray(input) ? input : input?.words;
  if (!Array.isArray(list)) die("word timings must be an array or an object with a words array");
  const words = list
    .map((w) => (Array.isArray(w) ? { text: w[0], start: w[1], end: w[2] } : w))
    .filter((w) => w && (w.type === undefined || w.type === "word"))
    .map((w) => ({ text: String(w.text).trim(), start: Number(w.start), end: Number(w.end) }))
    .filter((w) => w.text);
  if (!words.length) die("no words in the timings");
  if (words.some((w) => !Number.isFinite(w.start) || !Number.isFinite(w.end))) die("every word needs numeric start and end");
  return words;
};

const isMp3 = (buf) => (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);

// Download one file to dest (.mp3); anything that is not mp3 (Gemini returns WAV) is converted with Remotion's ffmpeg.
const fetchTo = async (url, dest) => {
  if (!/^https:\/\//.test(url ?? "")) die("--url must be an https URL from the generation result");
  const t0 = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) die(`download failed: HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  if (isMp3(buf)) writeFileSync(dest, buf);
  else {
    const tmp = `${dest}.download`;
    writeFileSync(tmp, buf);
    const out = `${dest}.tmp.mp3`;
    const r = spawnSync("npx", ["remotion", "ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-codec:a", "libmp3lame", "-b:a", "192k", out], { stdio: ["ignore", "inherit", "inherit"] });
    rmSync(tmp, { force: true });
    if (r.status !== 0) die(`ffmpeg could not convert ${url} to mp3`);
    renameSync(out, dest);
  }
  console.log(`saved ${dest} (${buf.length} bytes downloaded in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
};

// ---- narration ----

// The generation call for one scene, built from meta.voice. `style` is the scene's voiceStyle or the video's style.
const ttsCall = (voice, text, style, lang) => {
  const { provider, model, voice: name, settings = {} } = voice;
  if (provider === "elevenlabs-mcp")
    return { tool: "creative_generate_speech", input: { prompt: style ? `${style} ${text}` : text, model_id: model, voice_id: name, generations_count: 1 } };
  if (provider !== "fal") die(`meta.voice.provider must be fal or elevenlabs-mcp, got ${provider}`);
  if (model.startsWith("google/gemini"))
    return { tool: "run_model", endpoint_id: model, input: { prompt: text, voice: name, ...(style ? { style_instructions: style } : {}), ...settings } };
  if (model.startsWith("elevenlabs/tts/"))
    return { tool: "run_model", endpoint_id: model, input: { text: style ? `${style} ${text}` : text, voice: name, ...(lang ? { language_code: lang } : {}), ...settings } };
  die(`meta.voice.model ${model} is not supported; use a google/gemini-*-tts or elevenlabs/tts/* endpoint`);
};

const ttsHash = (v, s) => sha(JSON.stringify([s.narration, v.provider, v.model, v.voice, s.voiceStyle ?? v.style ?? "", v.settings ?? {}]));

const planTts = (slug) => {
  const { meta, scenes } = load(slug);
  const v = meta.voice;
  if (!v?.voice) die("meta.voice.voice is empty; take it from the BRIEF.md Voice section");
  const only = opt("--scene");
  const targets = scenes.filter((s) => !only || s.id === only);
  if (only && !targets.length) die(`no scene ${only}`);
  const lang = (meta.lang ?? "").split("-")[0].toLowerCase() || undefined;
  let chars = 0;
  let count = 0;
  for (const s of targets) {
    const style = s.voiceStyle ?? v.style ?? "";
    const hash = ttsHash(v, s);
    const file = s.audio.file;
    const words = file.replace(/\.mp3$/, ".words.json");
    if (!flag("--force") && upToDate(file, sidecarOf(file), hash) && existsSync(words)) continue;
    const call = ttsCall(v, s.narration, style, lang);
    const sent = call.input.prompt ?? call.input.text;
    chars += sent.length;
    count++;
    line({ scene: s.id, ...call, chars: sent.length, out: file, words: { tool: "run_model", endpoint_id: SCRIBE, input: { audio_url: "<url of the generated audio>", ...(lang ? { language_code: lang } : {}), diarize: false, tag_audio_events: false } } });
  }
  console.log(count ? `tts: ${count} scene(s), ${chars} characters to generate (${v.provider} ${v.model}, voice ${v.voice})` : "tts: every scene is up to date");
};

const saveTts = async (slug, sceneId) => {
  const { meta, scenes } = load(slug);
  const s = scenes.find((x) => x.id === sceneId) ?? die(`no scene ${sceneId}`);
  const words = wordsFrom(readStdinJson());
  await fetchTo(opt("--url"), s.audio.file);
  write(s.audio.file.replace(/\.mp3$/, ".words.json"), JSON.stringify(words) + "\n");
  write(sidecarOf(s.audio.file), ttsHash(meta.voice, s) + "\n");
  console.log(`${s.id}: ${words.length} words, ${words[0].start.toFixed(2)}-${words.at(-1).end.toFixed(2)} s`);
};

// Words per minute of a voice sample, so the script is written to the real rate.
const pace = (slug) => {
  const voice = opt("--voice") ?? die('pace needs --voice "<provider, model, voice, style>"');
  const words = wordsFrom(readStdinJson());
  const seconds = words.at(-1).end - words[0].start;
  if (!(seconds > 0)) die("the sample has no duration");
  const wpm = Math.round((words.length / seconds) * 60);
  const out = join("videos", slug, "research", "pace.json");
  write(out, JSON.stringify({ voice, words: words.length, seconds: Number(seconds.toFixed(2)), wpm }, null, 2) + "\n");
  console.log(`pace: ${words.length} words in ${seconds.toFixed(2)} s = ${wpm} words per minute; wrote ${out}`);
};

// ---- sound effects ----

// Shared UI sounds for tutorial clicks and typing, needed when any scene clicks or types and sfxDensity is not none.
const UI_SOUNDS = {
  click: { prompt: "a single soft mouse click, close microphone, dry, no reverb", duration: 0.5, kinds: ["click"] },
  type: { prompt: "a short burst of quiet laptop keyboard typing, dry, no reverb", duration: 1.5, kinds: ["type", "fill"] },
};

const sfxEntries = ({ meta, scenes }) => {
  const duration = opt("--duration");
  if (duration !== undefined && !(Number(duration) >= 0.5 && Number(duration) <= 30)) die("--duration must be 0.5 to 30 seconds");
  const out = [];
  for (const s of scenes)
    s.sfx.forEach((x, i) => {
      const input = { text: x.prompt, ...(duration !== undefined ? { duration_seconds: Number(duration) } : {}), ...(flag("--loop") ? { loop: true } : {}) };
      out.push({ key: `${s.id}:${i}`, file: x.file, prompt: x.prompt, input, hash: sha(JSON.stringify([x.prompt, duration ?? null, flag("--loop")])) });
    });
  if (meta.sound.sfxDensity !== "none") {
    const used = (kinds) =>
      scenes.some(
        (s) =>
          (Array.isArray(s.data?.steps) && s.data.steps.some((st) => kinds.includes(st.action))) ||
          (s.capture?.record && s.capture.steps.some((st) => kinds.some((k) => k in st))),
      );
    for (const [name, u] of Object.entries(UI_SOUNDS))
      if (used(u.kinds)) out.push({ key: `ui-${name}`, file: join("public", "sfx", `ui-${name}.mp3`), prompt: `lib:ui-${name}`, fallback: u, input: { text: u.prompt, duration_seconds: u.duration }, hash: sha(JSON.stringify([`ui-${name}`])) });
  }
  return out;
};

const planSfx = (slug) => {
  const entries = sfxEntries(load(slug));
  const data = opt("--data");
  let count = 0;
  for (const e of entries) {
    if (!flag("--force") && upToDate(e.file, sidecarOf(e.file), e.hash)) continue;
    const lib = e.prompt.match(/^lib:([a-z0-9-]+)$/);
    if (lib && findSound(lib[1], data) && useSound(lib[1], e.file, data)) {
      write(sidecarOf(e.file), e.hash + "\n");
      console.log(`${e.key}: ${lib[1]} from the sound library -> ${e.file}`);
      continue;
    }
    if (lib && !e.fallback) die(`${e.key}: no sound ${lib[1]} in the sound library (sfx-library.mjs list)`);
    count++;
    line({ key: e.key, tool: "run_model", endpoint_id: SFX_MODEL, input: e.input, out: e.file });
  }
  console.log(count ? `sfx: ${count} effect(s) to generate` : "sfx: every effect is in place");
};

const saveSfx = async (slug, key) => {
  const e = sfxEntries(load(slug)).find((x) => x.key === key) ?? die(`no sfx entry ${key}; keys come from plan sfx`);
  await fetchTo(opt("--url"), e.file);
  write(sidecarOf(e.file), e.hash + "\n");
};

// ---- music ----

const musicFile = join("public", "audio", "music.mp3");

const planMusic = (slug) => {
  const { meta, scenes } = load(slug);
  const prompt = meta.sound.musicPrompt;
  if (!prompt) {
    logDecision(slug, "music skipped: meta.sound.musicPrompt is empty.");
    return console.log("music: no prompt, skipped");
  }
  if (!flag("--force") && existsSync(musicFile)) return console.log("music: up to date");
  const missing = scenes.filter((s) => s.audio.durationSec == null).map((s) => s.id);
  if (missing.length) die(`audio.durationSec is null for ${missing.join(", ")}; run the voice stage first`);
  const total = scenes.reduce((a, s) => a + s.audio.durationSec, 0);
  const ms = Math.min(600000, Math.max(3000, Math.ceil(total) * 1000));
  line({ tool: "run_model", endpoint_id: MUSIC_MODEL, input: { prompt, music_length_ms: ms, force_instrumental: true }, out: musicFile });
};

// ---- lyric alignment (music videos) ----

// Section headers like [CHORUS] stay out of the text sent for alignment and are attached to the lines they precede.
const lyricLines = (slug) => {
  const file = join("videos", slug, "lyrics.txt");
  if (!existsSync(file)) die(`missing ${file}`);
  const lines = [];
  let section = null;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const t = raw.trim();
    const header = t.match(/^\[(.+)\]$/);
    if (header) section = header[1];
    else if (t) lines.push({ section, text: t });
  }
  return lines;
};

const alignState = (slug) => {
  const audio = opt("--audio");
  if (!audio || !existsSync(audio)) die("align needs --audio <existing file>");
  const lines = lyricLines(slug);
  const text = lines.map((l) => l.text).join("\n");
  return { audio, lines, text, hash: sha(JSON.stringify([sha(readFileSync(audio)), text])), out: join("videos", slug, "research", "alignment.json") };
};

const planAlign = (slug) => {
  const { audio, lines, text, hash, out } = alignState(slug);
  const cached = !flag("--force") && existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
  if (cached?.hash === hash) {
    // Headers are not part of the hash; take the current ones from lyrics.txt without a new call.
    cached.lines.forEach((l, i) => (l.section = lines[i].section));
    write(out, JSON.stringify(cached, null, 2));
    return console.log(`align: ${out} up to date, sections refreshed from lyrics.txt`);
  }
  line({ tool: "run_model", endpoint_id: ALIGN_MODEL, input: { audio_url: `<url of ${audio} after upload_file>`, text }, upload: audio, out });
};

const saveAlign = (slug) => {
  const { audio, lines, hash, out } = alignState(slug);
  const result = readStdinJson();
  const words = (result.words ?? die("stdin needs the alignment result with a words array"))
    .map((w) => ({ text: String(w.text), start: Number(w.start), end: Number(w.end), ...(w.loss !== undefined ? { loss: w.loss } : {}) }));
  // Map words back to lyric lines by letters consumed, because the aligner may group tokens differently from
  // the text (a parenthesised ad-lib comes back as one word).
  const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  let wi = 0;
  for (const l of lines) {
    l.words = [];
    let need = norm(l.text).length;
    while (need > 0 && wi < words.length) {
      const w = words[wi++];
      const n = norm(w.text).length;
      if (!n) continue;
      l.words.push({ ...w, text: w.text.trim() });
      need -= n;
    }
    l.start = l.words[0]?.start ?? null;
    l.end = l.words.at(-1)?.end ?? null;
  }
  const loss = Number(result.loss ?? NaN);
  write(out, JSON.stringify({ hash, audio, loss, lines, words }, null, 2));
  const empty = lines.filter((l) => !l.words.length).length;
  console.log(`align: wrote ${out} (${lines.length} lines, ${words.length} words, loss ${loss.toFixed(3)}, ${empty} lines without words)`);
};

// ---- dispatch ----

const [slug, kind, key] = positional;
try {
  if (cmd === "plan" && slug && ["tts", "sfx", "music", "align"].includes(kind)) ({ tts: planTts, sfx: planSfx, music: planMusic, align: planAlign })[kind](slug);
  else if (cmd === "save" && slug && kind === "tts" && key) await saveTts(slug, key);
  else if (cmd === "save" && slug && kind === "sfx" && key) await saveSfx(slug, key);
  else if (cmd === "save" && slug && kind === "music") await fetchTo(opt("--url"), musicFile);
  else if (cmd === "save" && slug && kind === "align") saveAlign(slug);
  else if (cmd === "pace" && slug) pace(slug);
  else if (cmd === "fetch" && positional.length === 2) await fetchTo(positional[0], positional[1]);
  else if (cmd === "fail" && slug && kind) {
    logDecision(slug, kind);
    console.log(`logged to videos/${slug}/research/decisions.md`);
  } else die("usage: audio.mjs plan <slug> tts|sfx|music|align | save <slug> tts <scene>|sfx <key>|music|align | pace <slug> | fetch <url> <dest> | fail <slug> <text>");
} catch (e) {
  die(`${cmd}: ${e.message}`);
}
