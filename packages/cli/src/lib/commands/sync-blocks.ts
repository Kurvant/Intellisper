import { Command } from "commander";
import { findBlocks, publishBlockFromFolder } from '../utils/block-utils';
import chalk from "chalk";
import { join } from "path";

async function syncBlocks(
  params:
  {apiUrl: string,
  apiKey: string,
  blocks: string[] | null,
  failOnError: boolean,}
) {
  const blocksDirectory = join(process.cwd(), 'packages', 'blocks', 'custom')
  const blockFolders = await findBlocks(blocksDirectory, params.blocks);
    for (const blockFolder of blockFolders) {
      await publishBlockFromFolder({
        blockFolder,
       ...params
      });
    }
}

export const syncBlockCommand = new Command('sync')
    .description('Find new blocks versions and sync them with the database')
    .requiredOption('-h, --apiUrl <url>', 'API URL ex: https://your-instance.example.com/api')
    .option('-p, --blocks <blocks...>', 'Specify one or more block names to sync. ' +
      'If not provided, all custom blocks in the directory will be synced.')
    .option('-f, --fail-on-error', 'Exit the process if an error occurs while syncing a block', false)
    .action(async (options) => {
        const apiKey = process.env.IB_API_KEY;
        const blocks = options.blocks ? [...new Set<string>(options.blocks)] : null;
        const failOnError = options.failOnError;
        if (!apiKey) {
            console.error(chalk.red('IB_API_KEY environment variable is required'));
            process.exit(1);
        }
        await syncBlocks({
          apiUrl: options.apiUrl.replace(/\/$/, ''),
          apiKey,
          blocks,
          failOnError
        });
    });
