import type { ModuleContent } from "../types";

export const ragContent: ModuleContent = {
  moduleId: "rag",
  learn: {
    moduleId: "rag",
    summary: {
      beginner:
        "RAG lets a model answer questions using your own documents: relevant chunks are found and handed to the model along with the question, so answers can be grounded in real content instead of just what the model memorized during training.",
      intermediate:
        "The RAG pipeline — chunk, embed, index, retrieve, (optionally rewrite/compress), generate — has a failure mode at every stage, and strategies like HyDE, multi-query, parent-document retrieval, and contextual compression each target a specific one. Citations and faithfulness checks are what make a RAG answer verifiable rather than just plausible.",
      senior:
        "RAG reduces hallucination risk by giving the model something concrete to condition on, but it does not eliminate it — the model can still ignore, misread, or blend retrieved content with unsupported prior knowledge. Diagnosing a bad RAG answer requires separating retrieval-stage failure (wrong/missing chunks: context precision/recall) from generation-stage failure (right chunks, bad use of them: faithfulness/answer relevance) — conflating the two wastes debugging effort on the wrong half of the pipeline.",
    },
    explain: [
      {
        heading: "RAG is retrieve, then generate, grounded",
        body: "A query gets embedded and used to find the most relevant stored chunks (via vector search, BM25, or hybrid), and those chunks are inserted into the prompt alongside the question so the model's answer is conditioned on real retrieved content. Every stage — chunking, embedding, indexing, retrieving, generating — can fail independently, and the `/rag/failure-mode-demo` endpoint deliberately engineers each one (miss, ignored, lost-in-the-middle, stale) so you can see what each specific failure actually looks like.",
      },
      {
        heading: "Strategy choice depends on what's actually wrong with your queries",
        body: "HyDE helps when queries are terse and phrased very differently from how answers are written. Multi-query helps when a single phrasing risks missing relevant documents. Parent-document retrieval helps when small precise chunks lack enough surrounding context to generate a full answer. Each strategy targets a specific failure mode — picking one without a reason to believe it's your actual problem just adds cost and latency for no measured benefit.",
      },
      {
        heading: "Citations make an answer checkable, not just confident",
        body: "This app's `/rag/query` puts citations in `run.output.metadata.citations`, mapping claims back to specific `chunkId`/`documentId` pairs. A citation that doesn't actually say what the answer claims is a concrete, checkable hallucination signal — far more actionable than just eyeballing whether an answer 'sounds right.'",
      },
    ],
    underTheHood: [
      {
        heading: "Every pipeline strategy emits its own stage trail",
        body: "`/rag/query` emits one `stage` event per pipeline step — `rewrite`, `retrieve`, `compress`, `generate`, depending on strategy — each carrying a `RetrievalDebug` payload, before streaming the actual generation tokens. This lets you see exactly which stage a specific run's quality problem came from, rather than only seeing the final answer.",
      },
      {
        heading: "The 'stale' failure mode is deliberately engineered against a snapshot",
        body: "`/rag/failure-mode-demo`'s `stale` mode queries against a snapshot of the collection taken before a document update, specifically to demonstrate what happens when an index isn't kept in sync with its source documents — a very real production failure that's otherwise hard to reproduce on demand.",
      },
      {
        heading: "Parent-document retrieval decouples the retrieval unit from the context unit",
        body: "Small chunks get embedded and matched precisely, but what actually gets handed to the generator is each matched chunk's larger parent section — giving you precise matching and sufficient context simultaneously, at the cost of maintaining the parent-child relationship in storage rather than just a flat chunk list.",
      },
    ],
    seniorGotchas: [
      {
        heading: "A faithful answer can still be wrong if the retrieved context was wrong",
        body: "Faithfulness measures whether claims are supported by retrieved context, not whether the context itself is true or current — a faithful answer built on stale or incorrect source documents is still a wrong answer. Faithfulness and factual correctness are separate questions that need separate checks.",
      },
      {
        heading: "Higher top-k improves recall but can hurt precision and trigger lost-in-the-middle",
        body: "Retrieving more chunks lowers the odds of missing needed information (recall) but dilutes the context with more irrelevant material (precision) and raises the odds that a critical chunk lands in a context position the model pays less attention to. A reranker — retrieve broadly, then trim precisely — is usually a better lever than just cranking top-k.",
      },
      {
        heading: "Query rewriting can inject the model's own wrong assumptions before retrieval even starts",
        body: "Rewriting a vague follow-up ('what about the second one?') into a standalone query requires the model to guess what 'the second one' refers to — if that guess is wrong, every downstream retrieval step inherits the error silently, and the final answer looks like a retrieval miss when it was actually a rewriting miss.",
      },
      {
        heading: "Agentic RAG inherits every general agent risk, not just RAG risk",
        body: "Letting the model decide when/how often to retrieve adds flexibility but also loop risk, runaway cost, and harder debugging (a variable number of calls per request) — it needs the same step/budget limits any agent loop needs, not a RAG-specific exemption.",
      },
    ],
  },
  pitfalls: [
    {
      id: "rag-chunk-too-large",
      title: "Chunks are too large, diluting embeddings and burning context budget",
      symptom: "Retrieval returns technically-relevant chunks, but answers seem to ignore the specific detail the user asked about.",
      cause: "Large chunks mix multiple topics into one embedding, weakening the semantic signal for any single sub-topic, and waste context window space with irrelevant surrounding text once retrieved.",
      fix: "Compare smaller chunk sizes (with appropriate overlap) against the current size using the chunk-preview tool and measure retrieval precision, not just qualitative impressions.",
      severity: "medium",
    },
    {
      id: "rag-stale-index",
      title: "Answers reference outdated information after a source document was updated",
      symptom: "A document was edited or corrected, but the RAG system keeps citing the old version's content.",
      cause: "The vector index wasn't re-embedded/re-upserted after the document update — the old chunks' vectors are still live in the collection.",
      fix: "Treat document updates as requiring re-chunk, re-embed, and re-index (not just a database row update), and consider tracking an index freshness timestamp per document to catch drift automatically.",
      severity: "high",
    },
    {
      id: "rag-faithfulness-vs-correctness-confusion",
      title: "A 'faithful' answer is treated as verified-correct",
      symptom: "An answer is confirmed faithful to retrieved context (every claim traceable to a chunk) but turns out to be factually wrong.",
      cause: "The retrieved source document itself was outdated or incorrect — faithfulness checking only verifies the answer matches its sources, not that the sources are true.",
      fix: "Treat faithfulness and factual correctness as separate checks; faithfulness catches generation-stage hallucination, but source-document accuracy needs its own data-quality process.",
      severity: "medium",
    },
    {
      id: "rag-top-k-too-high",
      title: "Raising top-k to 'fix' missed retrievals makes answers worse, not better",
      symptom: "After increasing top-k from 5 to 20 to catch a missed document, overall answer quality drops rather than improves.",
      cause: "More retrieved chunks diluted the context with irrelevant material and pushed some critical information into a 'lost in the middle' position the model paid less attention to.",
      fix: "Retrieve broadly for recall, then rerank or compress down to a smaller, precise set before generation, instead of just permanently raising top-k.",
      severity: "medium",
    },
    {
      id: "rag-citations-unchecked",
      title: "Citations are displayed but never actually verified against chunk content",
      symptom: "A citation links to a chunk that doesn't actually support the claim it's attached to.",
      cause: "Citation metadata was taken at face value from the model's output without verifying the cited chunk's text actually contains supporting content.",
      fix: "Add an automated or spot-check faithfulness pass that confirms each citation's chunk content actually supports the claim it's attached to, rather than trusting the model's self-reported citation.",
      severity: "high",
    },
  ],
  quiz: [
    {
      id: "rag-q1",
      question: "A RAG answer is confirmed faithful to its retrieved context but still factually wrong. What does this tell you?",
      options: [
        "Faithfulness checking is broken and should be disabled",
        "The retrieved source documents themselves were outdated or incorrect — faithfulness only verifies the answer matches its sources, not that the sources are true",
        "The model must have ignored the retrieved context entirely",
        "This combination is logically impossible",
      ],
      correctIndex: 1,
      explanation: "Faithfulness and factual correctness are deliberately separate concepts. A faithful answer accurately reflects what the retrieved context said — if that context was wrong or stale, a perfectly faithful answer can still be a wrong answer. This is a data-quality problem, not a generation problem.",
      difficulty: "senior",
    },
    {
      id: "rag-q2",
      question: "Why might raising top-k from 5 to 20 make RAG answers worse instead of better?",
      options: [
        "Higher top-k always strictly improves answer quality with no downside",
        "More retrieved chunks can dilute context with irrelevant material and push important information into a position the model attends to less (lost-in-the-middle)",
        "top-k has no effect on generation, only on retrieval latency",
        "The vector database caps top-k at 5 by design",
      ],
      correctIndex: 1,
      explanation: "Raising top-k improves recall (less likely to miss needed info) but can hurt precision (more irrelevant chunks mixed in) and increases the risk that a needed chunk lands in a context position the model pays less attention to. Reranking/compression down to a smaller precise set is usually a better fix than just raising top-k.",
      difficulty: "intermediate",
    },
    {
      id: "rag-q3",
      question: "HyDE generates a hypothetical answer before embedding the query for retrieval. When is this most likely to help?",
      options: [
        "When queries are long, detailed, and already phrased like the target documents",
        "When queries are short, ambiguous, or phrased very differently from how answers appear in the corpus",
        "Only when the corpus has fewer than 10 documents",
        "HyDE never provides any measurable benefit over a plain query embedding",
      ],
      correctIndex: 1,
      explanation: "HyDE addresses the lexical/structural gap between terse queries and longer documents by embedding a hypothetical answer (closer in style to real documents) instead of the bare query. It helps most when that gap is large — short, under-specified, or differently-phrased queries.",
      difficulty: "intermediate",
    },
    {
      id: "rag-q4",
      question: "A document was corrected, but the RAG system keeps citing the old content. What's the most likely root cause?",
      options: [
        "The LLM has a persistent memory of the old document",
        "The vector index still holds the old chunks' embeddings because the document update didn't trigger a re-chunk/re-embed/re-index pass",
        "Citations are randomly generated and unrelated to the actual index",
        "The chunking strategy was set to 'semantic' instead of 'fixed-size'",
      ],
      correctIndex: 1,
      explanation: "RAG retrieves from whatever is actually stored in the vector index, not from some live view of the source document. If an update to the source doesn't trigger re-chunking, re-embedding, and re-indexing, the old vectors remain live and keep getting retrieved — this is the 'stale' failure mode this app's failure-mode-demo deliberately reproduces.",
      difficulty: "senior",
    },
    {
      id: "rag-q5",
      question: "Why does agentic RAG need the same step/budget limits as any other agent loop?",
      options: [
        "Because agentic RAG is actually unrelated to agent architecture",
        "Because letting the model decide when/how often to retrieve introduces the same loop and runaway-cost risks as any agent making repeated autonomous decisions",
        "Because agentic RAG always retrieves exactly once per query, so limits are redundant",
        "Because the vector database enforces limits automatically regardless of the application",
      ],
      correctIndex: 1,
      explanation: "Agentic RAG turns retrieval into a tool the model can call repeatedly and adaptively, which is powerful but inherits every general agent risk — looping, excessive calls, unpredictable cost — so it needs explicit max-steps/budget/timeout limits, not a RAG-specific exemption from them.",
      difficulty: "senior",
    },
  ],
  presets: [
    {
      id: "rag-strategy-comparison",
      label: "Basic vs HyDE vs multi-query on an ambiguous question",
      description: "Run the same terse, ambiguous query through basic, HyDE, and multi-query strategies and compare the retrieved chunks and final answer for each.",
    },
    {
      id: "rag-failure-mode-tour",
      label: "Tour all four engineered failure modes",
      description: "Deliberately trigger miss, ignored, lost-in-the-middle, and stale failure modes one by one and read each one's diagnosis and fix.",
    },
    {
      id: "rag-chunk-size-200-vs-1000",
      label: "Chunk size 200 vs 1000 on the same corpus",
      description: "Index the same document set at two very different chunk sizes and compare end-to-end answer quality and citation precision on the same query set.",
    },
    {
      id: "rag-compression-on-off",
      label: "Contextual compression on vs off",
      description: "Run an identical query with and without contextual compression enabled and compare context size, latency, and whether the answer actually changes.",
    },
  ],
};
