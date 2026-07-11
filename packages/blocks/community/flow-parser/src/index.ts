import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { flowParserAuth } from './lib/common/auth';
import { uploadDocument } from './lib/actions/upload-document';
import { newParsedDocumentByTemplate } from './lib/triggers/new-parsed-document-by-template';
import { newParsedDocumentFound } from './lib/triggers/new-parsed-document-found';

export const flowParser = createBlock({
  displayName: 'FlowParser',
  description: 'Upload, process, and manage documents programmatically with FlowParser\'s REST API.',
  auth: flowParserAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/flow-parser.png',
  categories: [BlockCategory.DEVELOPER_TOOLS],
  authors: ["onyedikachi-david"],
  actions: [uploadDocument],
  triggers: [newParsedDocumentByTemplate, newParsedDocumentFound],
});
