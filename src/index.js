import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import pkg from '../package.json' with { type: 'json' };

import createAuthCommand from './commands/auth.js';
import createFeedCommand from './commands/feed/index.js';
import createCorrelationsCommand from './commands/correlations.js';
import createCallCommand from './commands/call.js';
import createRaasCommand from './commands/raas/index.js';
import { renderError } from './lib/helpers.js';

const program = new Command();

program
  .name('magnit')
  .version(pkg.version)
  .description(chalk.cyan.bold(pkg.description));

program.addCommand(createAuthCommand());
program.addCommand(createFeedCommand());
program.addCommand(createCorrelationsCommand());
program.addCommand(createCallCommand());
program.addCommand(createRaasCommand());

program
  .command('test')
  .description('A simple test command to check if the CLI is working.')
  .action(() => {
    console.log(chalk.green('✅ Magnit CLI is set up correctly!'));
  });

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    renderError(error);
    process.exit(1);
  }
}

main();
