import { readdir, stat } from 'node:fs/promises'
import * as path from 'path'
import { cwd } from 'node:process'
import { readPackageJson } from './files'
import { exec } from './exec'
import axios from 'axios'
import chalk from 'chalk'
import FormData from 'form-data';
import fs from 'fs';
import { prepareBlockDistForPublish } from './prepare-block-utils';

export const blocksPath = () => path.join(cwd(), 'packages', 'blocks')
export const customBlockPath = () => path.join(blocksPath(), 'custom')

/**
 * Finds and returns the paths of specific blocks or all available blocks in a given directory.
 *
 * @param inputPath - The root directory to search for blocks. If not provided, a default path to custom blocks is used.
 * @param blocks - An optional array of block names to search for. If not provided, all blocks in the directory are returned.
 * @returns A promise resolving to an array of strings representing the paths of the found blocks.
 */
export async function findBlocks(inputPath?: string, blocks?: string[]): Promise<string[]> {
    const blocksRootPath = inputPath ?? customBlockPath()
    const blocksFolders = await traverseFolder(blocksRootPath)
    if (blocks) {
        return blocks.flatMap((block) => {
          const folder = blocksFolders.find((p) => {
              const normalizedPath = path.normalize(p);
              return normalizedPath.endsWith(path.sep + block);
          });
          if (!folder) {
              return [];
          }
          return [folder];
      });
    } else {
        return blocksFolders
    }
}

/**
 * Finds and returns the path of a single block. Exits the process if the block is not found.
 *
 * @param blockName - The name of the block to search for.
 * @returns A promise resolving to a string representing the path of the found block. If not found, the process exits.
 */
export async function findBlock(blockName: string): Promise<string | null> {
    return (await findBlocks(blocksPath(), [blockName]))[0] ?? null;
}

export async function buildBlock(blockFolder: string): Promise<{ outputFolder: string, outputFile: string }> {
    const packageJson = await readPackageJson(blockFolder);

    await buildPackage(packageJson.name);

    const compiledPath = `packages/${removeStartingSlashes(blockFolder).split(path.sep + 'packages')[1]}/dist`;

    prepareBlockDistForPublish(blockFolder);

    const { stdout } = await exec('npm pack --json', { cwd: compiledPath });
    const tarFileName = JSON.parse(stdout)[0].filename;
    return {
        outputFolder: compiledPath,
        outputFile: path.join(compiledPath, tarFileName)
    };
}

export async function buildPackage(packageName: string) {
    await exec(`npx turbo run build --filter=${packageName} --force`);
    return {
        outputFolder: `dist/packages/${packageName}`,
    }
}

export async function publishBlockFromFolder(
    {blockFolder, apiUrl, apiKey, failOnError}:
  {blockFolder: string,
  apiUrl: string,
  apiKey: string,
  failOnError: boolean,}
) {
    const packageJson = await readPackageJson(blockFolder);

    await buildPackage(packageJson.name);

    const { outputFile } = await buildBlock(blockFolder);
    const formData = new FormData();

    console.log(chalk.blue(`Uploading ${outputFile}`));
    formData.append('blockArchive', fs.createReadStream(outputFile));
    formData.append('blockName', packageJson.name);
    formData.append('blockVersion', packageJson.version);
    formData.append('packageType', 'ARCHIVE');
    formData.append('scope', 'PLATFORM');

    try {
        await axios.post(`${apiUrl}/v1/blocks`, formData, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...formData.getHeaders()
            }
        });
        console.info(chalk.green(`Block '${packageJson.name}' published.`));
    } catch (error) {

        if (axios.isAxiosError(error)) {
            if (error.response?.status === 409) {
                console.info(chalk.yellow(`Block '${packageJson.name}' and '${packageJson.version}' already published.`));
            } else if (error.response && Math.floor(error.response.status / 100) !== 2) {
                console.info(chalk.red(`Error publishing block '${packageJson.name}',  ${error}` ));
                if (failOnError) {
                    console.info(chalk.yellow(`Terminating process due to publish failure for block '${packageJson.name}' (fail-on-error is enabled)`));
                    process.exit(1);
                }
            } else {
                console.error(chalk.red(`Unexpected error: ${error.message}`));
                if (failOnError) {
                    console.info(chalk.yellow(`Terminating process due to unexpected error for block '${packageJson.name}' (fail-on-error is enabled)`));
                    process.exit(1);
                }
            }
        } else {
            console.error(chalk.red(`Unexpected error: ${error.message}`));
            if (failOnError) {
              console.info(chalk.yellow(`Terminating process due to unexpected error for block '${packageJson.name}' (fail-on-error is enabled)`));
              process.exit(1);
            }
        }
    }
}
async function traverseFolder(folderPath: string): Promise<string[]> {
    const paths: string[] = []
    const directoryExists = await stat(folderPath).catch(() => null)

    if (directoryExists && directoryExists.isDirectory()) {
        const files = await readdir(folderPath)

        for (const file of files) {
            const filePath = path.join(folderPath, file)
            const fileStats = await stat(filePath)
            if (fileStats.isDirectory() && file !== 'node_modules' && file !== 'dist') {
                paths.push(...await traverseFolder(filePath))
            }
            else if (file === 'package.json') {
                paths.push(folderPath)
            }
        }
    }
    return paths
}

export function displayNameToKebabCase(displayName: string): string {
    return displayName.toLowerCase().replace(/\s+/g, '-');
}

export function displayNameToCamelCase(input: string): string {
    const words = input.split(' ');
    const camelCaseWords = words.map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      } else {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
    });
    return camelCaseWords.join('');
  }

export const assertBlockExists = async (blockName: string | null) => {
    if (!blockName) {
      console.error(chalk.red(`🚨 Block ${blockName} not found`));
      process.exit(1);
    }
  };


  export const removeStartingSlashes = (str: string) => {
    return str.startsWith('/') ? str.slice(1) : str;
  }
