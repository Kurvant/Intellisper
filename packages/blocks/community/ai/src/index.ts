
import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { BlockCategory } from '@intelblocks/shared';
import { askAI } from './lib/actions/text/ask-ai';
import { summarizeText } from './lib/actions/text/summarize-text';
import { generateImageAction } from "./lib/actions/image/generate-image";
import { classifyText } from "./lib/actions/utility/classify-text";
import { extractStructuredData } from "./lib/actions/utility/extract-structured-data";
import { runAgent } from "./lib/actions/agents/run-agent";


export const ai = createBlock({
  displayName: "AI",
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.78.2',
  categories: [
    BlockCategory.ARTIFICIAL_INTELLIGENCE,
    BlockCategory.UNIVERSAL_AI,
  ],
  logoUrl: "https://cdn.activepieces.com/pieces/new-core/text-ai.svg",
  authors: ['anasbarg', 'amrdb', 'Louai-Zokerburg'],
  actions: [askAI, summarizeText, generateImageAction, classifyText, extractStructuredData, runAgent],
  triggers: [],
});

export * from './lib/common/props';
export * from './lib/common/ai-sdk';