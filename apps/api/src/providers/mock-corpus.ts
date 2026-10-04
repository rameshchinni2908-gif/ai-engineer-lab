/**
 * Curated, hand-written sentence templates for `MockProvider`. Chosen
 * deterministically by hashing the prompt so the same prompt always picks
 * the same template, then rendered word-by-word through `sampling.ts`'s
 * temperature/top-p/top-k machinery so the *choice of words* - not just
 * whether text is emitted - visibly reacts to sampling params.
 *
 * Every even-indexed word (0-based, i.e. roughly every other word, chosen by
 * a fixed stride so the result stays grammatical) is a "variable slot" with
 * alternative candidate words of comparable grammatical role; all other
 * words are fixed ("anchor" words) so the sentence skeleton always reads
 * sensibly regardless of which alternates get sampled.
 */

export interface TemplateSpec {
  /** `{topic}` is substituted with a word extracted from the user's prompt. */
  words: string[];
}

export const TEMPLATES: TemplateSpec[] = [
  {
    words:
      "Based on the provided context, the key idea is that {topic} generally works by combining several signals to reliably produce a useful outcome for the given task.".split(
        " ",
      ),
  },
  {
    words:
      "Thinking through this carefully, the first step is understanding {topic}, then we can broadly evaluate the trade-offs and pick a practical approach for the stated constraints.".split(
        " ",
      ),
  },
  {
    words:
      "{topic} is a fundamentally important concept in modern AI systems, and it typically helps engineers build observable, reliable, and cost-effective applications over time.".split(
        " ",
      ),
  },
  {
    words:
      "In summary, {topic} offers a practically useful balance between speed, cost, and quality, and teams that specifically measure these trade-offs tend to make clearly better decisions.".split(
        " ",
      ),
  },
];

/** Deterministic alternate-word pool used for every "variable" slot. */
export const ALTERNATE_POOL = [
  "clearly",
  "largely",
  "broadly",
  "notably",
  "practically",
  "fundamentally",
] as const;

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "to",
  "of",
  "and",
  "in",
  "on",
  "for",
  "with",
  "this",
  "that",
  "it",
  "how",
  "what",
  "why",
  "does",
  "do",
  "can",
  "i",
  "you",
  "me",
  "please",
]);

/** Pure: pick a short "topic" word out of the user's prompt for templating. */
export function extractTopic(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return words[0] ?? "this topic";
}

/** Pure: select a template deterministically from a hash. */
export function selectTemplate(hash: number): TemplateSpec {
  const idx = hash % TEMPLATES.length;
  return TEMPLATES[idx] ?? TEMPLATES[0]!;
}
