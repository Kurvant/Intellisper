
    import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
    import { BlockCategory } from '@intelblocks/shared';
    import { outputQrcodeAction } from './lib/actions/output-qrcode-action'
    
    export const qrcode = createBlock({
      displayName: 'QR Code',
      auth: BlockAuth.None(),
      minimumSupportedRelease: '0.30.0',
      logoUrl: "https://cdn.activepieces.com/pieces/new-core/qrcode.svg",
      categories: [BlockCategory.CORE],
      authors: ['Meng-Yuan Huang'],
      actions: [
        outputQrcodeAction,
      ],
      triggers: [],
    });
    