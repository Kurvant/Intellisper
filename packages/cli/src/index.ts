import { Command } from 'commander';
import { createActionCommand } from './lib/commands/create-action';
import { createBlockCommand } from './lib/commands/create-block';
import { createTriggerCommand } from './lib/commands/create-trigger';
import { syncBlockCommand } from './lib/commands/sync-blocks';
import { publishBlockCommand } from './lib/commands/publish-block';
import { buildBlockCommand } from './lib/commands/build-block';
import { generateWorkerTokenCommand } from './lib/commands/generate-worker-token';
import { generateTranslationFileForAllBlocksCommand, generateTranslationFileForBlockCommand } from './lib/commands/generate-translation-file-for-block';

const blockCommand = new Command('blocks')
  .description('Manage blocks');

blockCommand.addCommand(createBlockCommand);
blockCommand.addCommand(syncBlockCommand);
blockCommand.addCommand(publishBlockCommand);
blockCommand.addCommand(buildBlockCommand);
blockCommand.addCommand(generateTranslationFileForBlockCommand);
blockCommand.addCommand(generateTranslationFileForAllBlocksCommand);
const actionCommand = new Command('actions')
  .description('Manage actions');

actionCommand.addCommand(createActionCommand);

const triggerCommand = new Command('triggers')
  .description('Manage triggers')

triggerCommand.addCommand(createTriggerCommand)


const workerCommand = new Command('workers')
  .description('Manage workers')

workerCommand.addCommand(generateWorkerTokenCommand)

const program = new Command();

program.version('0.0.1').description('Intellisper CLI');

program.addCommand(blockCommand);
program.addCommand(actionCommand);
program.addCommand(triggerCommand);
program.addCommand(workerCommand);
program.parse(process.argv);
