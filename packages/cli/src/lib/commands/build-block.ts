import { Command } from "commander";
import { buildBlock, findBlock } from '../utils/block-utils';
import chalk from "chalk";
import inquirer from "inquirer";

async function buildBlocks(blockName: string) {
    const blockFolder = await findBlock(blockName);
    const { outputFolder } = await buildBlock(blockFolder);
    console.info(chalk.green(`Block '${blockName}' built and packed successfully at ${outputFolder}.`));
}

export const buildBlockCommand = new Command('build')
    .description('Build blocks without publishing')
    .argument('[name]', 'name of the block to build')
    .option('--name <blockName>', 'name of the block to build')
    .action(async (positionalName, options) => {
        const blockName = positionalName ?? options.name;
        const questions = [
            {
                type: 'input',
                name: 'name',
                message: 'Enter the block folder name',
                placeholder: 'google-drive',
                when() {
                    return !blockName
                }
            },
        ];
        const answers = await inquirer.prompt(questions);
        await buildBlocks(blockName ?? answers.name);
    });
