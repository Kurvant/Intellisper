import { createBlock } from "@intelblocks/blocks-framework";
import { imageRouterAuth } from "./lib/common/auth";
import { BlockCategory } from "@intelblocks/shared";
import { createImage } from "./lib/actions/create-image";
import { imageToImage } from "./lib/actions/image-to-image";

export const imageRouter = createBlock({
  displayName: "ImageRouter",
  auth: imageRouterAuth,
  minimumSupportedRelease: '0.36.1',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  description: "Generate images with any model available on ImageRouter.",
  logoUrl: "https://cdn.activepieces.com/pieces/image-router.png",
  authors: ["onyedikachi-david"],
  actions: [
    createImage,
    imageToImage,
  ],
  triggers: [],
});
