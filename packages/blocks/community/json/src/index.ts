
import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { convertTextToJson } from "./lib/actions/convert-text-to-json";
import { convertJsonToText } from "./lib/actions/convert-json-to-text";
import { runJsonataQuery } from "./lib/actions/run-jsonata-query";

export const jsonAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Please use **test-key** as value for API Key',
});

export const json = createBlock({
  displayName: "JSON",
  description: "Convert JSON to text and vice versa",
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.30.0',
  logoUrl: "https://cdn.activepieces.com/pieces/new-core/json-helper.svg",
  authors: ["leenmashni","abuaboud","bertrandong"],
  actions: [convertJsonToText, convertTextToJson, runJsonataQuery],
  triggers: [],
});
