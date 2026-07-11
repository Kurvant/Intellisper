import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { convertJsonToXml } from './lib/actions/convert-json-to-xml';
import { convertXmlToJson } from './lib/actions/convert-xml-to-json';

export const xml = createBlock({
  displayName: 'XML',
  description: 'Extensible Markup Language for storing and transporting data',

  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/xml.png',
  categories: [BlockCategory.CORE],
  auth: BlockAuth.None(),
  authors: ["Willianwg","kishanprmr","AbdulTheActivePiecer","khaledmashaly","abuaboud"],
  actions: [convertJsonToXml, convertXmlToJson],
  triggers: [],
});
