// src/commands/raas/run.js — raas run | check | fetch  (request -> status -> paged data)
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { MagnitCliError } from '../../lib/errors.js';
import { renderKeyValues } from '../../lib/helpers.js';
import { fetchData, getReport, raasSession, reportUrls, requestRun, runStatus, waitForRun } from '../../lib/raas.js';
import { addDataOptions, dataSettings, renderRows } from './_shared.js';

function warnIfKeysExpiring() {
  const s = raasSession();
  if (s.keyDaysLeft === undefined || !s.keysExpiring) return;
  console.error(chalk.yellow(s.keyDaysLeft <= 0
    ? 'RaaS keys are past their validity window; create new keys in your Magnit profile.'
    : `RaaS keys expire in about ${s.keyDaysLeft} day(s); create new keys in your Magnit profile.`));
}

async function download(report, runId, options) {
  const settings = dataSettings(options);
  const spinner = ora('Fetching report data...').start();
  let result;
  try {
    result = await fetchData(report, runId, {
      ...settings,
      onPage: (p) => { spinner.text = `Fetched page ${p.page}${p.totalPages ? ` of ${p.totalPages}` : ''}...`; },
    });
  } catch (error) {
    spinner.fail(chalk.red('Could not fetch the report data.'));
    throw error;
  }
  spinner.stop();
  if (!settings.all && result.totalPages > 1) {
    console.error(chalk.yellow(`Showing one page of ${result.totalPages} (${result.totalRecords} records total). Use --all for everything.`));
  }
  renderRows(result.rows, options);
}

export function buildRunCommand() {
  const cmd = new Command('run')
    .description('Request a saved report, wait for it, and print the rows (POST -> status -> data).')
    .argument('<report>', 'Saved report name')
    .option('--no-wait', 'Only request the report and print the runid')
    .option('--interval <seconds>', 'Seconds between status polls', '5')
    .option('--timeout <seconds>', 'Give up waiting after this many seconds', '600')
    .option('--dry-run', 'Print the URLs that would be called and exit (no keys needed)');

  addDataOptions(cmd).action(async (name, options) => {
    const report = getReport(name);
    if (options.dryRun) {
      const urls = reportUrls(report);
      console.log(chalk.bold(`POST ${urls.requestUrl}`));
      console.log(`GET  ${urls.statusUrl}`);
      console.log(`GET  ${urls.dataUrl}?page=1${options.size ? `&size=${options.size}` : ''}`);
      console.log(chalk.gray('\n(dry run — nothing was sent)'));
      return;
    }
    const intervalMs = Number(options.interval) * 1000;
    const timeoutMs = Number(options.timeout) * 1000;
    if (!(intervalMs > 0) || !(timeoutMs > 0)) throw new MagnitCliError('--interval and --timeout must be positive numbers of seconds.');
    dataSettings(options); // validate before spending a request

    warnIfKeysExpiring();
    const { runId } = await requestRun(report);
    if (!options.wait) {
      renderKeyValues([['RunId', runId]]);
      console.log(chalk.gray(`Check: magnit raas check ${name} ${runId}   |   Fetch: magnit raas fetch ${name} ${runId}`));
      return;
    }

    const spinner = ora(`Run ${runId} queued...`).start();
    let status;
    try {
      status = await waitForRun(report, runId, { intervalMs, timeoutMs, onTick: (s) => { spinner.text = `Run ${runId}: ${s.status || 'pending'}`; } });
    } catch (error) {
      spinner.fail(chalk.red('Stopped waiting.'));
      throw error;
    }
    if (status.failed) {
      spinner.fail(chalk.red(`Report run failed: ${status.status}${status.message ? ` — ${status.message}` : ''}`));
      process.exitCode = 1;
      return;
    }
    spinner.succeed(chalk.green('Report ready.'));
    await download(report, runId, options);
  });

  return cmd;
}

export function buildCheckCommand() {
  return new Command('check')
    .description('Check the status of a report run.')
    .argument('<report>', 'Saved report name')
    .argument('<runId>')
    .action(async (name, runId) => {
      const status = await runStatus(getReport(name), runId);
      renderKeyValues([
        ['RunId', status.runId],
        ['ReportId', status.reportId ?? ''],
        ['Status', status.done ? chalk.green(status.status) : status.failed ? chalk.red(status.status) : chalk.yellow(status.status)],
        ['Message', status.message ?? ''],
      ]);
      if (status.failed) process.exitCode = 1;
    });
}

export function buildFetchCommand() {
  const cmd = new Command('fetch')
    .description('Fetch the rows of a finished report run.')
    .argument('<report>', 'Saved report name')
    .argument('<runId>');
  return addDataOptions(cmd).action(async (name, runId, options) => {
    dataSettings(options);
    warnIfKeysExpiring();
    await download(getReport(name), runId, options);
  });
}
