import { createBlock } from "@intelblocks/blocks-framework";
import { BlockCategory } from "@intelblocks/shared";
import { parserExpertAuth } from "./lib/common/auth";
import { uploadDocument } from "./lib/actions/upload-document";
import { getExtractedData } from "./lib/actions/get-extracted-data";

export const parserExpert = createBlock({
  displayName: "Parser Expert",
  auth: parserExpertAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/parser-expert.png",
  description: "Parse documents and extract data from PDFs, DOCX files, images, and webpages using Parser Expert's powerful API.",
  categories: [BlockCategory.CONTENT_AND_FILES],
  authors: ["onyedikachi-david"],
  actions: [
    uploadDocument,
    getExtractedData,
  ],
  triggers: [],
});
