// src/commands/raas/login.js — raas login | logout | status (RaaS keys; separate from `magnit auth`)
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { MagnitCliError } from '../../lib/errors.js';
import { renderKeyValues } from '../../lib/helpers.js';
import { TOKEN_URLS, loginRaas, logoutRaas, raasSession } from '../../lib/raas.js';

export function buildLoginCommand() {
  return new Command('login')
    .description('Save RaaS API keys (Client Key, Client Secret, Credential Key) and verify them with a token request.')
    .option('--region <region>', `Token endpoint: ${Object.keys(TOKEN_URLS).join(' | ')} (default us)`)
    .option('--token-url <url>', 'Custom token endpoint (overrides --region; copy it from the report\'s RaaS window)')
    .option('--credential-key <key>', 'Credential Key (or MAGNIT_RAAS_CREDENTIAL_KEY)')
    .option('--client-key <key>', 'Client Key (or MAGNIT_RAAS_CLIENT_KEY)')
    .option('--client-secret <secret>', 'Client Secret (or MAGNIT_RAAS_CLIENT_SECRET; prefer the env var)')
    .option('--keys-created <date>', 'When the keys were created (YYYY-MM-DD), for the expiry warning (default: now)')
    .option('--key-days <days>', 'Key validity in days: 30, 60 or 90 (default 90)')
    .action(async (options) => {
      const given = {
        credentialKey: options.credentialKey ?? process.env.MAGNIT_RAAS_CREDENTIAL_KEY,
        clientKey: options.clientKey ?? process.env.MAGNIT_RAAS_CLIENT_KEY,
        clientSecret: options.clientSecret ?? process.env.MAGNIT_RAAS_CLIENT_SECRET,
      };
      const questions = [];
      if (!given.credentialKey) questions.push({ type: 'input', name: 'credentialKey', message: 'Credential Key:' });
      if (!given.clientKey) questions.push({ type: 'input', name: 'clientKey', message: 'Client Key:' });
      if (!given.clientSecret) questions.push({ type: 'password', name: 'clientSecret', message: 'Client Secret:', mask: '*' });
      const keys = { ...given, ...(questions.length ? await inquirer.prompt(questions) : {}) };

      const region = options.tokenUrl ? undefined : options.region ?? 'us';
      const tokenUrl = options.tokenUrl ?? TOKEN_URLS[region];
      if (!tokenUrl) throw new MagnitCliError(`Unknown region "${region}".`, `Valid: ${Object.keys(TOKEN_URLS).join(', ')}.`);

      let keysCreatedAt;
      if (options.keysCreated) {
        keysCreatedAt = Date.parse(options.keysCreated);
        if (Number.isNaN(keysCreatedAt)) throw new MagnitCliError('--keys-created must be a date like 2026-09-01.');
      }
      const keyDays = options.keyDays ? Number(options.keyDays) : undefined;
      if (keyDays !== undefined && !(keyDays > 0)) throw new MagnitCliError('--key-days must be a positive number.');

      const spinner = ora(`Requesting a RaaS token from ${tokenUrl} ...`).start();
      try {
        await loginRaas({ ...keys, tokenUrl, region, keysCreatedAt, keyDays });
      } catch (error) {
        spinner.fail(chalk.red('RaaS authentication failed.'));
        throw error;
      }
      spinner.succeed(chalk.green('RaaS keys saved and verified.'));
    });
}

export function buildLogoutCommand() {
  return new Command('logout')
    .description('Forget the saved RaaS keys and token (saved reports are kept).')
    .action(() => {
      logoutRaas();
      console.log(chalk.green('RaaS keys removed.'));
    });
}

export function buildStatusCommand() {
  return new Command('status')
    .description('Show the saved RaaS keys (no secrets) and how long they have left.')
    .action(() => {
      const s = raasSession();
      if (!s.loggedIn) {
        console.log(chalk.yellow('❌ No RaaS keys saved.'));
        console.log(`   Run ${chalk.cyan('magnit raas login')}.`);
        return;
      }
      console.log(chalk.green('✅ RaaS keys saved.'));
      const left = s.keyDaysLeft === undefined ? 'unknown' : s.keyDaysLeft <= 0 ? chalk.red('EXPIRED') : s.keysExpiring ? chalk.yellow(`${s.keyDaysLeft} day(s) left`) : `${s.keyDaysLeft} day(s) left`;
      renderKeyValues([
        ['Token endpoint', s.tokenUrl],
        ['Credential Key', s.credentialKey],
        ['Client Key', s.clientKey],
        ['Key validity', `${s.keyDays} days (${left})`],
        ['Saved reports', s.reports.length ? s.reports.join(', ') : '(none)'],
      ]);
      if (s.keysExpiring) console.log(chalk.yellow('Create new keys in your Magnit profile soon; old ones expire a week after new ones are created.'));
    });
}
