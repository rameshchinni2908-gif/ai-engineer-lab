/**
 * Pure, offset-tracking text segmenters shared by every chunker. Each
 * function returns segments that are CONTIGUOUS and cover the entire input
 * (segment[i].end === segment[i+1].start, first.start === 0, last.end ===
 * text.length) so a chunker can reassemble exact source offsets for the
 * boundary-visualization UI without ever losing or duplicating a character.
 */

export interface Segment {
  start: number;
  end: number;
  text: string;
}

/** Splits into "word + its trailing whitespace" segments, covering `text` exactly. */
export function splitWords(text: string): Segment[] {
  const segments: Segment[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && !/\s/.test(text[j]!)) j++;
    while (j < n && /\s/.test(text[j]!)) j++;
    if (j === i) j = i + 1; // safety net, should be unreachable
    segments.push({ start: i, end: j, text: text.slice(i, j) });
    i = j;
  }
  return segments;
}

const SENTENCE_TERMINATORS = new Set([".", "!", "?"]);
const TRAILING_CLOSERS = new Set([".", "!", "?", '"', "'", ")", "]"]);

/** Splits into sentence segments (terminator + closing punctuation/quotes + trailing whitespace), covering `text` exactly. */
export function splitSentences(text: string): Segment[] {
  const segments: Segment[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && !SENTENCE_TERMINATORS.has(text[j]!)) j++;
    if (j < n) {
      j++; // include the terminator itself
      while (j < n && TRAILING_CLOSERS.has(text[j]!)) j++;
    }
    while (j < n && /\s/.test(text[j]!)) j++;
    if (j === i) j = i + 1; // safety net: no terminator/whitespace found to end of text
    segments.push({ start: i, end: j, text: text.slice(i, j) });
    i = j;
  }
  return segments;
}
