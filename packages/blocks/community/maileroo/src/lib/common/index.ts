import { IbFile } from "@intelblocks/blocks-framework";
import { isNil } from "@intelblocks/shared";

export function toEmailObjects(addresses: unknown[]) {
  return addresses
    .filter((addr): addr is string => typeof addr === 'string')
    .map((address) => ({ address }));
}

export function buildAttachmentList(attachments: Array<{ file: IbFile }>) {
  return attachments
    .filter(
      (item): item is { file: IbFile } =>
        typeof item === 'object' && !isNil(item) && 'file' in item,
    )
    .map(({ file }) => ({
      file_name: file.filename,
      content: file.base64,
    }));
}