/**
 * Pure, from-scratch BM25 (Okapi) scorer - no external search-index
 * dependency. Powers `/vector/hybrid-search`'s lexical retrieval leg: exact
 * keyword/rare-term matches (product codes, names) that dense vector search
 * can blur past in favor of semantic similarity.
 */

export interface Bm25Document {
  id: string;
  text: string;
}

export interface Bm25Result {
  id: string;
  score: number;
}

export interface Bm25Options {
  k1?: number;
  b?: number;
}

const TOKEN_RE = /[a-z0-9]+/g;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

/**
 * Scores every document in `corpus` against `query` via BM25 and returns
 * results sorted by descending score (documents with zero query-term
 * overlap still appear, scored 0, so callers can see the full ranking).
 */
export function bm25Search(query: string, corpus: Bm25Document[], opts: Bm25Options = {}): Bm25Result[] {
  const k1 = opts.k1 ?? 1.5;
  const b = opts.b ?? 0.75;
  const queryTerms = tokenize(query);

  const docs = corpus.map((d) => ({ id: d.id, terms: tokenize(d.text) }));
  if (queryTerms.length === 0 || docs.length === 0) {
    return docs.map((d) => ({ id: d.id, score: 0 }));
  }

  const docLengths = docs.map((d) => d.terms.length);
  const avgLen = docLengths.reduce((sum, len) => sum + len, 0) / Math.max(docs.length, 1);
  const N = docs.length;

  const uniqueQueryTerms = [...new Set(queryTerms)];
  const idf = new Map<string, number>();
  for (const term of uniqueQueryTerms) {
    const containing = docs.filter((d) => d.terms.includes(term)).length;
    idf.set(term, Math.log((N - containing + 0.5) / (containing + 0.5) + 1));
  }

  const results: Bm25Result[] = docs.map((doc, i) => {
    const termFreq = new Map<string, number>();
    for (const t of doc.terms) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);

    let score = 0;
    for (const term of uniqueQueryTerms) {
      const tf = termFreq.get(term) ?? 0;
      if (tf === 0) continue;
      const idfVal = idf.get(term) ?? 0;
      const docLen = docLengths[i] ?? 0;
      const denom = tf + k1 * (1 - b + b * (docLen / Math.max(avgLen, 1)));
      score += idfVal * ((tf * (k1 + 1)) / denom);
    }
    return { id: doc.id, score };
  });

  return results.sort((a, b2) => b2.score - a.score);
}
