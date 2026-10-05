const MAX_SUMMARY_CHARS = 600;
const MAX_GIST_CHARS = 140;

/**
 * Summary memory: a rolling compaction of the run so far - a pure,
 * deterministic string transform (no LLM call), unit-testable on its own.
 * Each update appends a bounded "gist" of the new step and truncates from
 * the front once the running summary exceeds `MAX_SUMMARY_CHARS`, so older
 * detail is dropped first while the summary stays small and inspectable.
 */
export class SummaryMemory {
  #summary = "";

  update(stepContent: string): string {
    const gist = stepContent.length > MAX_GIST_CHARS ? `${stepContent.slice(0, MAX_GIST_CHARS)}...` : stepContent;
    this.#summary = this.#summary ? `${this.#summary} -> ${gist}` : gist;
    if (this.#summary.length > MAX_SUMMARY_CHARS) {
      this.#summary = `...${this.#summary.slice(-MAX_SUMMARY_CHARS)}`;
    }
    return this.#summary;
  }

  get(): string {
    return this.#summary;
  }
}
