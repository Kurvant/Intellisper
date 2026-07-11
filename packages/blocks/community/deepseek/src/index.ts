
import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { baseUrl, unauthorizedMessage } from "./lib/common/common";
import OpenAI from 'openai';
import { askDeepseek } from "./lib/actions/ask-deepseek";
import { BlockCategory } from "@intelblocks/shared";
import { deepseekAuth } from './lib/auth';

        
    export const deepseek = createBlock({
      displayName: "DeepSeek",
      auth: deepseekAuth,
      categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
      minimumSupportedRelease: '0.36.1',
      logoUrl: "https://cdn.activepieces.com/pieces/deepseek.png",
      authors: ["PFernandez98"],
      actions: [askDeepseek],
      triggers: [],
    });
    