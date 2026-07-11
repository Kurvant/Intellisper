import chalk from 'chalk';
import { Command } from 'commander';
import { mkdir, readdir, writeFile } from 'fs/promises';
import inquirer from 'inquirer';
import path from 'node:path';

const validateBlockName = async (blockName: string) => {
  console.log(chalk.yellow('Validating block name....'));
  const blockNamePattern = /^(?![._])[a-z0-9-]{1,214}$/;
  if (!blockNamePattern.test(blockName)) {
    console.log(
      chalk.red(
        `🚨 Invalid block name: ${blockName}. Block names can only contain lowercase letters, numbers, and hyphens.`
      )
    );
    process.exit(1);
  }
};

const validatePackageName = async (packageName: string) => {
  console.log(chalk.yellow('Validating package name....'));
  const packageNamePattern = /^(?:@[a-zA-Z0-9-]+\/)?[a-zA-Z0-9-]+$/;
  if (!packageNamePattern.test(packageName)) {
    console.log(
      chalk.red(
        `🚨 Invalid package name: ${packageName}. Package names can only contain lowercase letters, numbers, and hyphens.`
      )
    );
    process.exit(1);
  }
};

const checkIfBlockExists = async (blockName: string, blockType: string) => {
  const blockPath = path.resolve('packages', 'blocks', blockType, blockName);
  try {
    await readdir(blockPath);
    console.log(chalk.red(`🚨 Block already exists at ${blockPath}`));
    process.exit(1);
  } catch {
    // Directory does not exist, which is expected
  }
};

function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

const scaffoldBlock = async (
  blockName: string,
  packageName: string,
  blockType: string
) => {
  const baseDir = path.resolve('packages', 'blocks', blockType, blockName);
  const srcDir = path.join(baseDir, 'src');
  const libDir = path.join(srcDir, 'lib');
  const i18nDir = path.join(srcDir, 'i18n');

  // Create directory structure
  await mkdir(libDir, { recursive: true });
  await mkdir(i18nDir, { recursive: true });

  // Create package.json
  const packageJson = {
    name: packageName,
    version: '0.0.1',
    type: 'commonjs',
    main: './dist/src/index.js',
    types: './dist/src/index.d.ts',
    dependencies: {
      '@intelblocks/blocks-common': 'workspace:*',
      '@intelblocks/blocks-framework': 'workspace:*',
      '@intelblocks/shared': 'workspace:*',
      tslib: '2.6.2',
    },
    scripts: {
      build: 'tsc -p tsconfig.lib.json && cp package.json dist/',
      lint: "eslint 'src/**/*.ts'",
    },
  };
  await writeFile(
    path.join(baseDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Create tsconfig.json
  const tsconfig = {
    extends: '../../../../tsconfig.base.json',
    compilerOptions: {
      module: 'commonjs',
      forceConsistentCasingInFileNames: true,
      strict: true,
      noImplicitOverride: true,
      noPropertyAccessFromIndexSignature: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
    },
    files: [],
    include: [],
    references: [{ path: './tsconfig.lib.json' }],
  };
  await writeFile(
    path.join(baseDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );

  // Create tsconfig.lib.json
  const tsconfigLib = {
    extends: './tsconfig.json',
    compilerOptions: {
      rootDir: '.',
      baseUrl: '.',
      paths: {},
      outDir: './dist',
      declaration: true,
      declarationMap: true,
      types: ['node'],
    },
    include: ['src/**/*.ts'],
    exclude: ['jest.config.ts', 'src/**/*.spec.ts', 'src/**/*.test.ts'],
  };
  await writeFile(
    path.join(baseDir, 'tsconfig.lib.json'),
    JSON.stringify(tsconfigLib, null, 2)
  );

  // Create .eslintrc.json
  const eslintConfig = {
    extends: ['../../../../.eslintrc.json'],
    ignorePatterns: ['!**/*'],
    overrides: [
      { files: ['*.ts', '*.tsx', '*.js', '*.jsx'], rules: {} },
      { files: ['*.ts', '*.tsx'], rules: {} },
      { files: ['*.js', '*.jsx'], rules: {} },
    ],
  };
  await writeFile(
    path.join(baseDir, '.eslintrc.json'),
    JSON.stringify(eslintConfig, null, 2)
  );

  // Create index.ts
  const blockNameCamelCase = blockName
    .split('-')
    .map((s, i) => {
      if (i === 0) {
        return s;
      }
      return s[0].toUpperCase() + s.substring(1);
    })
    .join('');

  const indexTemplate = `import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';

export const ${blockNameCamelCase} = createBlock({
  displayName: '${capitalizeFirstLetter(blockName)}',
  description: '',
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/${blockName}.png',
  authors: [],
  actions: [],
  triggers: [],
});
`;

  await writeFile(path.join(srcDir, 'index.ts'), indexTemplate);
};

export const createBlock = async (
  blockName: string,
  packageName: string,
  blockType: string
) => {
  await validateBlockName(blockName);
  await validatePackageName(packageName);
  await checkIfBlockExists(blockName, blockType);
  await scaffoldBlock(blockName, packageName, blockType);
  console.log(chalk.green('✨  Done!'));
  console.log(
    chalk.yellow(
      `The block has been generated at: packages/blocks/${blockType}/${blockName}`
    )
  );
};

export const createBlockCommand = new Command('create')
  .description('Create a new block')
  .action(async () => {
    const questions = [
      {
        type: 'input',
        name: 'blockName',
        message: 'Enter the block name:',
      },
      {
        type: 'input',
        name: 'packageName',
        message: 'Enter the package name:',
        default: (answers: Record<string, string>) =>
          `@intelblocks/block-${answers.blockName}`,
        when: (answers: Record<string, string>) =>
          answers.blockName !== undefined,
      },
      {
        type: 'list',
        name: 'blockType',
        message: 'Select the block type:',
        choices: ['community', 'custom'],
        default: 'community',
      },
    ];

    const answers = await inquirer.prompt(questions);
    createBlock(answers.blockName, answers.packageName, answers.blockType);
  });
