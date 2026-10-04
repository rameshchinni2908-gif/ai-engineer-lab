import type { GlossaryTerm } from "../types";
import { tokenizationContextTerms } from "./tokenization-context";
import { samplingDecodingTerms } from "./sampling-decoding";
import { promptingTerms } from "./prompting";
import { structuredOutputTerms } from "./structured-output";
import { embeddingsVectorTerms } from "./embeddings-vector";
import { ragChunkingTerms } from "./rag-chunking";
import { agentsTerms } from "./agents";
import { evalsTerms } from "./evals";
import { securityTerms } from "./security";
import { productionTerms } from "./production";
import { trainingAdaptationTerms } from "./training-adaptation";

export const GLOSSARY: GlossaryTerm[] = [
  ...tokenizationContextTerms,
  ...samplingDecodingTerms,
  ...promptingTerms,
  ...structuredOutputTerms,
  ...embeddingsVectorTerms,
  ...ragChunkingTerms,
  ...agentsTerms,
  ...evalsTerms,
  ...securityTerms,
  ...productionTerms,
  ...trainingAdaptationTerms,
];
