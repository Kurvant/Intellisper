import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import {
	searchAndReplaceText,
	addTextToPdf,
	addImageToPdf,
	convertHtmlToPdf,
	extractTextFromPdf,
	convertPdfToStructuredFormat,
	extractTablesFromPdf,
	addBarcodeToPdf,
} from './lib/actions';
import { BlockCategory } from '@intelblocks/shared';
import { pdfCoAuth } from './lib/auth';

export const pdfCo = createBlock({
	displayName: 'PDF.co',
	description: 'Automate PDF conversion, editing, extraction',
	categories: [BlockCategory.PRODUCTIVITY, BlockCategory.CONTENT_AND_FILES],
	logoUrl: 'https://cdn.activepieces.com/pieces/pdf-co.png',
	auth: pdfCoAuth,
	authors: ['onyedikachi-david', 'kishanprmr'],
	actions: [
		addBarcodeToPdf,
		addImageToPdf,
		addTextToPdf,
		convertHtmlToPdf,
		convertPdfToStructuredFormat,
		extractTablesFromPdf,
		extractTextFromPdf,
		searchAndReplaceText,
	],
	triggers: [],
});
