// src/commands/auth.js
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { ENVIRONMENTS } from '../lib/envs.js';
import { resolveBaseUrl } from '../lib/api.js';
import { login, logout, sessionInfo } from '../lib/auth.js';
import { renderKeyValues } from '../lib/helpers.js';

export default function createAuthCommand() {
  const auth = new Command('auth').description('Manage Magnit authentication (login, logout, status)');

  auth
    .command('login')
    .description('Authenticate with the Magnit API (OAuth password grant) and save the session.')
    .option('--env <env>', `Environment: ${Object.keys(ENVIRONMENTS).join(' | ')}`)
    .option('--base-url <url>', 'Custom base URL (overrides --env)')
    .option('--client-id <id>', 'API client id (or MAGNIT_CLIENT_ID)')
    .option('--client-secret <secret>', 'API client secret (or MAGNIT_CLIENT_SECRET)')
    .option('--username <username>', 'API username (or MAGNIT_USERNAME)')
    .option('--password <password>', 'API password (or MAGNIT_PASSWORD; prefer the env var over the flag)')
    .action(async (options) => {
      const given = {
        env: options.env ?? process.env.MAGNIT_ENV,
        clientId: options.clientId ?? process.env.MAGNIT_CLIENT_ID,
        clientSecret: options.clientSecret ?? process.env.MAGNIT_CLIENT_SECRET,
        username: options.username ?? process.env.MAGNIT_USERNAME,
        password: options.password ?? process.env.MAGNIT_PASSWORD,
      };

      // Prompt only for what is still missing, so the command also works non-interactively.
      const questions = [];
      if (!given.env && !options.baseUrl) {
        questions.push({
          type: 'list',
          name: 'env',
          message: 'Environment:',
          choices: Object.entries(ENVIRONMENTS).map(([value, e]) => ({ name: `${value} — ${e.label}`, value })),
        });
      }
      if (!given.clientId) questions.push({ type: 'input', name: 'clientId', message: 'API client id:' });
      if (!given.clientSecret) questions.push({ type: 'password', name: 'clientSecret', message: 'API client secret:', mask: '*' });
      if (!given.username) questions.push({ type: 'input', name: 'username', message: 'API username:' });
      if (!given.password) questions.push({ type: 'password', name: 'password', message: 'API password:', mask: '*' });

      const credentials = { ...given, ...(questions.length ? await inquirer.prompt(questions) : {}) };
      const baseUrl = resolveBaseUrl({ baseUrl: options.baseUrl, env: credentials.env });

      const spinner = ora(`Authenticating with ${baseUrl} ...`).start();
      try {
        await login({ ...credentials, baseUrl });
      } catch (error) {
        spinner.fail(chalk.red('Authentication failed.'));
        throw error;
      }
      spinner.succeed(chalk.green('Successfully authenticated!'));
      console.log(chalk.blue('Your API session is now active.'));
    });

  auth
    .command('logout')
    .description('Clear stored credentials, tokens and correlation IDs.')
    .action(() => {
      logout();
      console.log(chalk.green('Logged out. All stored session data has been removed.'));
    });

  auth
    .command('status')
    .description('Show the current session.')
    .action(() => {
      const info = sessionInfo();
      if (!info.loggedIn) {
        console.log(chalk.yellow('❌ You are not logged in.'));
        console.log(`   Run ${chalk.cyan('magnit auth login')} to authenticate.`);
        return;
      }
      console.log(chalk.green('✅ You are logged in.'));
      const expiry = info.expiresInSeconds === undefined
        ? 'unknown'
        : info.expiresInSeconds > 0 ? `in ${info.expiresInSeconds}s` : chalk.yellow('expired (will refresh on next call)');
      renderKeyValues([
        ['Environment', info.env ?? '(custom)'],
        ['Base URL', info.baseUrl],
        ['Username', info.username],
        ['Access token expires', expiry],
        ['Can refresh', info.canRefresh ? 'yes' : 'no'],
      ]);
    });

  return auth;
}
