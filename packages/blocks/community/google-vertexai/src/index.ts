import { createBlock } from "@intelblocks/blocks-framework";
import { BlockCategory } from "@intelblocks/shared";
import { vertexAiAuth } from "./lib/auth";
import { generateContent, generateImage, customApiCall } from "./lib/actions";

export const googleVertexai = createBlock({
  displayName: "Google Vertex AI",
  description: "Generate content and images using Gemini and Imagen models on Google Vertex AI.",
  auth: vertexAiAuth,
  minimumSupportedRelease: "0.71.4",
  logoUrl: "https://cdn.activepieces.com/pieces/google-vertexai.png",
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  authors: ["alinperghel", "onyedikachi-david","bertrandong"],
  actions: [generateContent, generateImage, customApiCall],
  triggers: [],
});

export { vertexAiAuth, GoogleVertexAIAuthValue } from "./lib/auth";
