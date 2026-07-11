import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { createRecords } from "./lib/actions/create-records";
import { BlockCategory } from "@intelblocks/shared";
import { deleteRecord } from "./lib/actions/delete-record";
import { updateRecord } from "./lib/actions/update-record";
import { getRecord } from "./lib/actions/get-record";
import { findRecords } from "./lib/actions/find-records";
import { clearTable } from "./lib/actions/clear-table";
import { downloadTable } from "./lib/actions/download-table";
import { newRecordTrigger } from "./lib/triggers/new-record";
import { deletedRecordTrigger } from "./lib/triggers/deleted-record";
import { updatedRecordTrigger } from "./lib/triggers/updated-record";

export const tables = createBlock({
  displayName: 'Tables',
  logoUrl: 'https://cdn.activepieces.com/pieces/new-core/tables.svg',
  categories: [BlockCategory.CORE],
  minimumSupportedRelease: '0.80.0',
  authors: ['amrdb'],
  auth: BlockAuth.None(),
  actions: [createRecords, deleteRecord, updateRecord, getRecord, findRecords, clearTable, downloadTable],
  triggers: [newRecordTrigger, updatedRecordTrigger, deletedRecordTrigger],
});
