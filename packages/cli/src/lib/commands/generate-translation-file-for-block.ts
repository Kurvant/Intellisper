import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import { Command } from 'commander';
import { buildPackage, findBlock, findBlocks } from '../utils/block-utils';
import { makeFolderRecursive, readPackageJson } from '../utils/files';
import { join } from 'node:path';
import { exec } from '../utils/exec';
import { blockTranslation } from '@intelblocks/blocks-framework';
import { MAX_KEY_LENGTH_FOR_CORWDIN } from '@intelblocks/shared';

const findBlockInModule = async (blockOutputFile: string) => {
    const module = await import(blockOutputFile);
    const exports = Object.values(module);
    for (const e of exports) {
      if (e !== null && e !== undefined && e.constructor.name === 'Block') {
          return e
      }
      }

      throw new Error(`Block not found in module, please check the block output file ${blockOutputFile}`);
}

const installDependencies = async (blockFolder: string) => {
    console.log(chalk.blue(`Installing dependencies ${blockFolder}`))
    await exec(`bun install`, {cwd: blockFolder,})
    console.log(chalk.green(`Dependencies installed ${blockFolder}`))
}


function getPropertyValue(object: Record<string, unknown>, path: string): unknown {
  const parsedKeys = path.split('.');
  if (parsedKeys[0] === '*') {
    return Object.values(object).map(item => getPropertyValue(item as Record<string, unknown>, parsedKeys.slice(1).join('.'))).filter(Boolean).flat()
  }
  const nextObject = object[parsedKeys[0]] as Record<string, unknown>;
  if (nextObject && parsedKeys.length > 1) {
    return getPropertyValue(nextObject, parsedKeys.slice(1).join('.'));
  }
  return nextObject;
}

const generateTranslationFileFromBlock = (block: Record<string, unknown>) => { const translation: Record<string, string> = {}
  try {
    blockTranslation.pathsToValuesToTranslate.forEach(path => {
      const value = getPropertyValue(block, path)
      if (value) {
        if (typeof value === 'string') {
          translation[value.slice(0, MAX_KEY_LENGTH_FOR_CORWDIN)] = value
        }
        else if (Array.isArray(value)) {
          value.forEach(item => {
            translation[item.slice(0, MAX_KEY_LENGTH_FOR_CORWDIN)] = item
          })
        }
      }
    })
  }
  catch (err) {
    console.error(`error generating translation file for block ${block.name}:`, err)
  }

  return translation
}



const generateTranslationFile = async (blockName: string) => {
  const blockRoot = await findBlock(blockName)
  const packageJson = await readPackageJson(blockRoot)
  await buildPackage(packageJson.name)
  try{
    await installDependencies(blockRoot)
    const blockFromModule = await findBlockInModule(blockRoot);
    const i18n = generateTranslationFileFromBlock({actions: (blockFromModule as any)._actions, triggers: (blockFromModule as any)._triggers, description: (blockFromModule as any).description, displayName: (blockFromModule as any).displayName, auth: (blockFromModule as any).auth});
    const i18nFolder = join(blockRoot, 'src', 'i18n')
    await makeFolderRecursive(i18nFolder);
    await writeFile(join(i18nFolder, 'translation.json'), JSON.stringify(i18n, null, 2));
    console.log(chalk.yellow('✨'), `Translation file for block created in ${i18nFolder}`);
  } catch (error) {
    console.error(chalk.red('❌'), `Error generating translation file for block ${blockName}, make sure you built the block`,error);
  }
};


export const generateTranslationFileForBlockCommand = new Command('generate-translation-file')
  .description('Generate i18n for a block')
  .argument('<blockName>', 'The name of the block to generate i18n for')
  .action(async (blockName: string) => {
    await generateTranslationFile(blockName);
  });
  export const generateTranslationFileForAllBlocksCommand = new Command('generate-translation-file-for-all-blocks')
  .description('Generate i18n for all blocks')
  .requiredOption('--shard-index <shardIndex>', 'Zero-based shard index to process', (value) => parseInt(value, 10))
  .requiredOption('--shard-total <shardTotal>', 'Total number of shards', (value) => parseInt(value, 10))
  .action(async ({shardIndex, shardTotal}: { shardIndex: number; shardTotal: number }) => {
    const blocksDirectory = join(process.cwd(), 'packages', 'blocks', 'community')
    const blocks = (await findBlocks(blocksDirectory)).map(block => block.split('/').pop());
    let totalTime = 0
    let indexAcrossAllBlocks = 0
    for (const block of blocks) {
      if ((indexAcrossAllBlocks % shardTotal) !== shardIndex) {
        indexAcrossAllBlocks++
        continue
      }
      const time= performance.now()
      await generateTranslationFile(block);
      console.log(chalk.yellow('✨'), `Translation file for block ${block} created in ${(performance.now() - time)/1000}s`)
      totalTime += (performance.now() - time)/1000
      indexAcrossAllBlocks++
    }
    console.log(chalk.yellow('✨'), `Total time taken to generate translation files for selected blocks: ${totalTime}s`)
  });
