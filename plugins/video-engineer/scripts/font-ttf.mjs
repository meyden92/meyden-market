#!/usr/bin/env node
// Downloads a static TTF of one Google Fonts family and weight, for extruded 3D type (three.js TextGeometry reads only
// static outlines). Node stdlib only.
//   font-ttf.mjs "<Family Name>" <weight> <dest.ttf>
// The Google Fonts CSS API answers a client without woff2 support with a truetype URL of a static instance.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [family, weight, dest] = process.argv.slice(2);
if (!family || !weight || !dest) {
  console.error('usage: font-ttf.mjs "<Family Name>" <weight> <dest.ttf>');
  process.exit(1);
}
const api = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weight}`;
const css = await fetch(api, { headers: { "User-Agent": "Wget/1.21" } });
if (!css.ok) {
  console.error(`font-ttf: ${css.status} for ${family} ${weight} (check the family name and that it has this weight)`);
  process.exit(1);
}
const url = (await css.text()).match(/url\((https:[^)]+\.ttf)\) format\('truetype'\)/)?.[1];
if (!url) {
  console.error(`font-ttf: no truetype source for ${family} ${weight}`);
  process.exit(1);
}
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, buf);
console.log(`font-ttf: ${family} ${weight} -> ${dest} (${buf.length} bytes, OFL or Apache licence per fonts.google.com)`);
