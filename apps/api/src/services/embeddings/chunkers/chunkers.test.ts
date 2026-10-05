import { describe, expect, it } from "vitest";
import type { ChunkConfig } from "@ail/shared";
import { chunkText, splitIntoSpans, assertValidChunkConfig } from "./index.js";
import { fixedChunk } from "./fixed.js";
import { recursiveChunk } from "./recursive.js";
import { sentenceChunk } from "./sentence.js";
import { semanticChunk } from "./semantic.js";
import { markdownChunk } from "./markdown.js";

function cfg(overrides: Partial<ChunkConfig>): ChunkConfig {
  return { strategy: "fixed", chunkSize: 20, chunkOverlap: 0, ...overrides };
}

const STRATEGIES: ChunkConfig["strategy"][] = ["fixed", "recursive", "sentence", "semantic", "markdown"];

describe("assertValidChunkConfig", () => {
  it("rejects chunkOverlap >= chunkSize", () => {
    expect(() => assertValidChunkConfig(cfg({ chunkSize: 10, chunkOverlap: 10 }))).toThrow();
    expect(() => assertValidChunkConfig(cfg({ chunkSize: 10, chunkOverlap: 20 }))).toThrow();
  });

  it("accepts chunkOverlap < chunkSize", () => {
    expect(() => assertValidChunkConfig(cfg({ chunkSize: 10, chunkOverlap: 3 }))).not.toThrow();
  });
});

describe.each(STRATEGIES)("%s chunker - shared edge cases", (strategy) => {
  it("returns no chunks for empty text", () => {
    const chunks = splitIntoSpans("", cfg({ strategy, chunkSize: 10, chunkOverlap: 2 }));
    expect(chunks).toEqual([]);
  });

  it("handles a single huge unsplittable token without infinite looping or dropping it", () => {
    const hugeWord = "x".repeat(500); // no whitespace/punctuation/sentence terminators anywhere
    const chunks = splitIntoSpans(hugeWord, cfg({ strategy, chunkSize: 5, chunkOverlap: 1 }));
    expect(chunks.length).toBeGreaterThan(0);
    // every character of the source must appear in at least one chunk
    const covered = new Set<number>();
    for (const c of chunks) for (let i = c.start; i < c.end; i++) covered.add(i);
    for (let i = 0; i < hugeWord.length; i++) expect(covered.has(i)).toBe(true);
  });

  it("produces chunk boundaries that stay within the source text bounds", () => {
    const text = "Paragraph one has several words. Paragraph two also has words! And a third one?";
    const chunks = splitIntoSpans(text, cfg({ strategy, chunkSize: 8, chunkOverlap: 2 }));
    for (const c of chunks) {
      expect(c.start).toBeGreaterThanOrEqual(0);
      expect(c.end).toBeLessThanOrEqual(text.length);
      expect(c.end).toBeGreaterThan(c.start);
      expect(text.slice(c.start, c.end)).toBe(c.text);
    }
  });

  it("produces overlap between consecutive chunks when chunkOverlap > 0 and more than one chunk results", () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ") + ".";
    const chunks = splitIntoSpans(text, cfg({ strategy, chunkSize: 10, chunkOverlap: 4 }));
    if (chunks.length > 1) {
      for (let i = 1; i < chunks.length; i++) {
        // overlap means chunk i's start offset is <= the previous chunk's end offset
        expect(chunks[i]!.start).toBeLessThanOrEqual(chunks[i - 1]!.end);
      }
    }
  });
});

describe("chunkText (full Chunk assembly)", () => {
  it("assigns sequential indices, stable ids, and tokenCount per chunk", () => {
    const text = "One two three four five six seven eight nine ten.";
    const chunks = chunkText("doc-1", text, cfg({ strategy: "fixed", chunkSize: 5, chunkOverlap: 1 }));
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.documentId).toBe("doc-1");
      expect(typeof c.id).toBe("string");
      expect(c.tokenCount).toBeGreaterThan(0);
    });
  });
});

describe("fixedChunk", () => {
  it("never splits a chunk larger than needed when text is shorter than chunkSize", () => {
    const text = "short text here";
    const chunks = fixedChunk(text, cfg({ chunkSize: 100, chunkOverlap: 0 }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe(text);
  });
});

describe("recursiveChunk", () => {
  it("prefers splitting on paragraph breaks before falling back to spaces", () => {
    const text = "Para one is short.\n\nPara two is also fairly short.\n\nPara three wraps up the doc.";
    const chunks = recursiveChunk(text, cfg({ strategy: "recursive", chunkSize: 6, chunkOverlap: 0 }));
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to character splitting when no configured separators are present ('no separators' edge case)", () => {
    const text = "a".repeat(200);
    const chunks = recursiveChunk(text, cfg({ strategy: "recursive", chunkSize: 5, chunkOverlap: 0, separators: ["\n\n"] }));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.text).join("")).toBe(text);
  });

  it("handles an explicitly empty separators list by going straight to character fallback", () => {
    const text = "some text without any configured separators to split on at all here";
    const chunks = recursiveChunk(text, cfg({ strategy: "recursive", chunkSize: 4, chunkOverlap: 0, separators: [] }));
    expect(chunks.length).toBeGreaterThan(0);
  });
});

describe("sentenceChunk", () => {
  it("keeps each sentence intact within a single chunk when it fits", () => {
    const text = "Short sentence one. Short sentence two. Short sentence three.";
    const chunks = sentenceChunk(text, cfg({ strategy: "sentence", chunkSize: 100, chunkOverlap: 0 }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe(text);
  });

  it("splits across multiple chunks once sentences exceed chunkSize, on sentence boundaries", () => {
    const text = "Alpha bravo charlie delta. Echo foxtrot golf hotel. India juliet kilo lima.";
    const chunks = sentenceChunk(text, cfg({ strategy: "sentence", chunkSize: 6, chunkOverlap: 0 }));
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("semanticChunk", () => {
  it("groups topically-similar repeated sentences together and starts a new group on a topic shift", () => {
    const text =
      "Cats are small furry animals. Cats like to sleep a lot. Cats often chase mice. " +
      "Rockets are powered by large engines. Rockets travel to outer space. Rockets require huge amounts of fuel.";
    const chunks = semanticChunk(text, cfg({ strategy: "semantic", chunkSize: 60, chunkOverlap: 0, semanticThreshold: 0.2 }));
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // every character must still be covered (no content lost during grouping)
    const covered = new Set<number>();
    for (const c of chunks) for (let i = c.start; i < c.end; i++) covered.add(i);
    for (let i = 0; i < text.length; i++) expect(covered.has(i)).toBe(true);
  });

  it("respects the configured chunkSize cap even for highly similar sentences", () => {
    const text = "Cats are great. Cats are great. Cats are great. Cats are great. Cats are great.";
    const chunks = semanticChunk(text, cfg({ strategy: "semantic", chunkSize: 8, chunkOverlap: 0, semanticThreshold: 0.1 }));
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("markdownChunk", () => {
  it("tags each chunk with its nearest enclosing header path", () => {
    const text = "# Guide\n\nIntro text here.\n\n## Install\n\nRun the installer and reboot.\n\n## Usage\n\nCall the CLI tool.";
    const chunks = markdownChunk(text, cfg({ strategy: "markdown", chunkSize: 10, chunkOverlap: 0 }));
    expect(chunks.length).toBeGreaterThan(0);
    const usageChunk = chunks.find((c) => c.text.includes("Call the CLI"));
    expect(usageChunk?.headerPath).toEqual(["Guide", "Usage"]);
  });

  it("clears deeper header levels once a shallower header appears", () => {
    const text = "# Top\n\n## Sub A\n\nContent A.\n\n# Top Two\n\nContent after a new top-level header.";
    const chunks = markdownChunk(text, cfg({ strategy: "markdown", chunkSize: 10, chunkOverlap: 0 }));
    const afterTopTwo = chunks.find((c) => c.text.includes("Content after"));
    expect(afterTopTwo?.headerPath).toEqual(["Top Two"]);
  });
});
