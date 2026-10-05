// src/commands/feed/_shared.js — Option sets and run/print helpers shared by feed subcommands
import chalk from 'chalk';
import ora from 'ora';
import { resolveBaseUrl, buildUrl } from '../../lib/api.js';
import { MagnitCliError } from '../../lib/errors.js';
import { buildFeedRequest, startFeed, waitForStatus } from '../../lib/engine.js';
import { renderJsonOutput, renderKeyValues, renderTableOutput } from '../../lib/helpers.js';

export function addOutputOption(cmd) {
  return cmd.option('-o, --output <format>', 'Output format: table or json', 'table');
}

export function addWaitOptions(cmd) {
  return cmd
    .option('-w, --wait', 'Poll request-status until Completed or Errored')
    .option('--interval <seconds>', 'Seconds between status polls (with --wait)', '5')
    .option('--timeout <seconds>', 'Give up polling after this many seconds (with --wait)', '300');
}

export function addRunOptions(cmd) {
  addOutputOption(addWaitOptions(cmd));
  return cmd
    .option('--format <format>', 'Payload format: json or xml (default: from file extension, else json)')
    .option('--path <path>', 'Override the endpoint path (relative to the base URL)')
    .option('--dry-run', 'Print the request that would be sent and exit (no login needed)')
    .option('--env <env>', 'Environment used to build the URL for --dry-run');
}

export function pollSettings(options) {
  const intervalMs = Number(options.interval) * 1000;
  const timeoutMs = Number(options.timeout) * 1000;
  if (!(intervalMs > 0) || !(timeoutMs > 0)) {
    throw new MagnitCliError('--interval and --timeout must be positive numbers of seconds.');
  }
  return { intervalMs, timeoutMs };
}

export function renderStatus(status, output) {
  if (output === 'json') {
    renderJsonOutput(status);
    return;
  }
  const colour = status.requestStatus === 'Completed' ? chalk.green : status.requestStatus === 'Errored' ? chalk.red : chalk.yellow;
  renderKeyValues([
    ['CorrelationId', status.correlationId],
    ['RequestStatus', colour(status.requestStatus)],
    ...(status.records.length ? [['Records', status.records.length]] : []),
  ]);
  if (status.records.length) renderTableOutput(status.records);
}

function printDryRun(baseUrl, request) {
  console.log(chalk.bold(`${request.method} ${buildUrl(baseUrl, request.path)}`));
  for (const [name, value] of Object.entries(request.headers)) console.log(`${name}: ${value}`);
  console.log('Authorization: Bearer <access token>');
  if (request.data !== undefined) console.log(`\n${request.data}`);
  console.log(chalk.gray('\n(dry run — nothing was sent)'));
}

/**
 * Build, send, and optionally wait on a push/pull feed request. Shared by `feed submit` and `feed pull`.
 * @param {object} feed       registry entry from getFeed()
 * @param {string} [feedId]   Magnit-assigned feed identifier, for feeds that take one
 * @param {{ body?: string, format: string }} payload
 */
export async function runFeed(feed, feedId, { body, format }, options) {
  const request = buildFeedRequest(feed, { feedId, path: options.path, format, body });

  if (options.dryRun) {
    printDryRun(resolveBaseUrl(options), request);
    return;
  }

  const { intervalMs, timeoutMs } = pollSettings(options);
  const spinner = ora(`Sending ${feed.name} ${feed.direction === 'push' ? 'request' : 'pull'}...`).start();

  let ack;
  try {
    ack = await startFeed(feed, request, { feedId });
  } catch (error) {
    spinner.fail(chalk.red('Request failed.'));
    throw error;
  }
  spinner.succeed(chalk.green(`Accepted (ResponseCode ${ack.responseCode ?? '?'}).`));

  if (!options.wait) {
    if (options.output === 'json') renderJsonOutput(ack);
    else {
      renderKeyValues([['CorrelationId', ack.correlationId]]);
      console.log(chalk.gray(`Check progress: magnit feed status ${ack.correlationId} --feed ${feed.name}   (ID valid for 24h)`));
    }
    return;
  }

  const waiting = ora('Waiting for Magnit to process...').start();
  let status;
  try {
    status = await waitForStatus(feed, ack.correlationId, {
      format,
      intervalMs,
      timeoutMs,
      onTick: (s) => { waiting.text = `Status: ${s.requestStatus}`; },
    });
  } catch (error) {
    waiting.fail(chalk.red('Stopped waiting.'));
    throw error;
  }

  if (status.requestStatus.toLowerCase() === 'errored') {
    waiting.fail(chalk.red('Magnit reported the request as Errored.'));
    process.exitCode = 1;
  } else {
    waiting.succeed(chalk.green('Completed.'));
  }
  renderStatus(status, options.output);
}
