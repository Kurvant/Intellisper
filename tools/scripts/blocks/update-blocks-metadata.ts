import assert from 'node:assert';
import { BlockMetadata } from '../../../packages/blocks/framework/src';
import { StatusCodes } from 'http-status-codes';
import { HttpHeader } from '../../../packages/blocks/common/src';
import { IB_CLOUD_API_BASE, findNewPieces, pieceMetadataExists } from '../utils/block-script-utils';
import { chunk } from '../../../packages/shared/src/lib/core/common/utils/utils';
assert(process.env['IB_CLOUD_API_KEY'], 'API Key is not defined');

const { IB_CLOUD_API_KEY } = process.env;

const insertPieceMetadata = async (
  blockMetadata: BlockMetadata
): Promise<void> => {
  const body = JSON.stringify(blockMetadata);

  const headers = {
    ['api-key']: IB_CLOUD_API_KEY,
    [HttpHeader.CONTENT_TYPE]: 'application/json'
  };

  const cloudResponse = await fetch(`${IB_CLOUD_API_BASE}/admin/pieces`, {
    method: 'POST',
    headers,
    body
  });

  if (cloudResponse.status !== StatusCodes.OK && cloudResponse.status !== StatusCodes.CONFLICT) {
    throw new Error(await cloudResponse.text());
  }
};



const insertMetadataIfNotExist = async (blockMetadata: BlockMetadata) => {
  console.info(
    `insertMetadataIfNotExist, name: ${blockMetadata.name}, version: ${blockMetadata.version}`
  );

  const metadataAlreadyExist = await pieceMetadataExists(
    blockMetadata.name,
    blockMetadata.version
  );

  if (metadataAlreadyExist) {
    console.info(`insertMetadataIfNotExist, piece metadata already inserted`);
    return;
  }

  await insertPieceMetadata(blockMetadata);
};

const insertMetadata = async (blocksMetadata: BlockMetadata[]) => {
  const batches = chunk(blocksMetadata, 30)
  for (const batch of batches) {
    await Promise.all(batch.map(insertMetadataIfNotExist))
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
};

const main = async () => {
  console.log('update pieces metadata: started')

  const blocksMetadata = await findNewPieces()
  await insertMetadata(blocksMetadata)

  console.log('update pieces metadata: completed')
  process.exit()
}

main()
