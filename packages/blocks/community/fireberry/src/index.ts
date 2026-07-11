import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { BlockCategory } from "@intelblocks/shared";
import { createRecordAction } from "./lib/actions/create-record.action";
import { updateRecordAction } from "./lib/actions/update-record.action";
import { deleteRecordAction } from "./lib/actions/delete-record.action";
import { findRecordAction } from "./lib/actions/find-record.action";
import { recordCreatedOrUpdatedTrigger } from "./lib/triggers/record-created-updated.trigger";
import { fireberryAuth } from './lib/auth';

export const fireberry = createBlock({
  displayName: "Fireberry",
  auth: fireberryAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/fireberry.png",
  authors: ["sparkybug", "onyedikachi-david"],
  categories: [BlockCategory.SALES_AND_CRM],
  actions: [
    createRecordAction,
    updateRecordAction,
    deleteRecordAction,
    findRecordAction,
  ],
  triggers: [
    recordCreatedOrUpdatedTrigger,
  ],
});
    