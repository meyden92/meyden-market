// Lyric lines from the alignment: one Line per sung line with its block, word times and display window.
// A line belongs to the block of its section (nth occurrence of a section -> nth block with that section).
import { music } from "./config";

export type Word = { text: string; start: number; end: number; adlib: boolean };
export type Line = { idx: number; block: string; section: string; text: string; start: number; end: number; words: Word[]; adlib: boolean; show: [number, number] };

export const isAdlib = (s: string) => /^\(.*\)[.,!?]*$/.test(s.trim());
/** Lower-case letters, digits and hyphens only. */
export const cleanWord = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, "");

let built: { src: object; lines: Line[] } | null = null;
const build = (): Line[] => {
  const { alignment, blocks, fps } = music();
  const seen: Record<string, number> = {};
  let prev: string | null = null;
  const lines: Line[] = alignment.lines
    .filter((l) => l.words.length > 0)
    .map((l, idx) => {
      const section = l.section ?? "SONG";
      if (section !== prev) {
        seen[section] = (seen[section] ?? -1) + 1;
        prev = section;
      }
      const block = blocks.filter((b) => b.section === section)[seen[section]];
      if (!block) throw new Error(`lyrics: no block for section "${section}" occurrence ${seen[section] + 1}; regenerate blocks.json`);
      const words = l.words.map((w) => ({ text: w.text, start: w.start, end: Math.max(w.end, w.start + 0.08), adlib: isAdlib(w.text) }));
      return { idx, block: block.id, section, text: l.text, start: l.start, end: l.end, words, adlib: words.every((w) => w.adlib), show: [0, 0] };
    });
  // Display window: from just before the first word until the next line of the same block starts
  // (or 0.9 s after the line ends), never past the block's own end. Pickups (a line starting before
  // its block) therefore show over the outgoing block.
  lines.forEach((l, i) => {
    const next = lines.slice(i + 1).find((n) => n.block === l.block && !n.adlib);
    const end = blocks.find((b) => b.id === l.block)!.to / fps;
    const until = Math.min(next ? next.start - 0.04 : Infinity, l.end + 0.9, end);
    l.show = [l.start - 0.06, Math.max(until, l.end)];
  });
  return lines;
};
/** Every aligned line in song order. */
export const allLines = (): Line[] => {
  const key = music().alignment;
  if (built?.src !== key) built = { src: key, lines: build() };
  return built.lines;
};

export const linesOf = (b: string) => allLines().filter((l) => l.block === b);
/** Lines of block b whose display window contains t. */
export const activeLines = (b: string, t: number) => linesOf(b).filter((l) => t >= l.show[0] && t < l.show[1]);
/** All words of a block, flattened. */
export const wordsOf = (b: string) => linesOf(b).flatMap((l) => l.words);
/** Start times of words matching `w` (case/punctuation-insensitive) in block b. */
export const wordStarts = (b: string, w: string) => wordsOf(b).filter((x) => cleanWord(x.text) === cleanWord(w)).map((x) => x.start);
/** First word in block b whose text contains `w`. */
export const findWord = (b: string, w: string) => wordsOf(b).find((x) => cleanWord(x.text).includes(cleanWord(w)));
/** Latest value ≤ t in a sorted list, or undefined. */
export const lastAt = (times: number[], t: number) => {
  let r: number | undefined;
  for (const x of times) if (x <= t) r = x;
  return r;
};
/** True if a line contains only refrain words (config.refrainWords) and ad-libs. */
export const isRefrainLine = (l: Line) => {
  const refrain = (music().refrainWords ?? []).map(cleanWord);
  return refrain.length > 0 && l.words.every((w) => w.adlib || refrain.includes(cleanWord(w.text)));
};
