// src/commands/feed/status.js — Check (or wait on) a correlation ID
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getFeed } from '../../lib/feeds.js';
import { MagnitCliError } from '../../lib/errors.js';
import { detectFormat } from '../../lib/payload.js';
import { findCorrelation } from '../../lib/correlations.js';
import { fetchStatus, waitForStatus } from '../../lib/engine.js';
import { addOutputOption, addWaitOptions, pollSettings, renderStatus } from './_shared.js';

export default function buildStatusCommand() {
  const cmd = new Command('status')
    .description('Check the status of a request by correlation ID (valid 24h). Outbound feeds also return their records.')
    .argument('<correlationId>')
    .option('--feed <feed>', 'Feed the request was sent to (default: looked up from the local correlation store)')
    .option('--status-method <method>', 'Override the status call: get or post')
    .option('--format <format>', 'json or xml', 'json');

  addWaitOptions(addOutputOption(cmd)).action(async (correlationId, options) => {
    const known = findCorrelation(correlationId);
    const feedName = options.feed ?? known?.feed;
    if (!feedName) {
      throw new MagnitCliError('Unknown correlation ID and no --feed given.', 'Pass --feed <feed>; see `magnit feed list`.');
    }
    if (known?.expired) {
      console.error(chalk.yellow('This correlation ID was issued more than 24h ago; Magnit may no longer recognise it.'));
    }

    const feed = getFeed(feedName);
    const method = options.statusMethod;
    if (method && !['get', 'post'].includes(method.toLowerCase())) {
      throw new MagnitCliError('--status-method must be get or post.');
    }
    const format = detectFormat({ explicit: options.format });

    if (!options.wait) {
      renderStatus(await fetchStatus(feed, correlationId, { method, format }), options.output);
      return;
    }

    const { intervalMs, timeoutMs } = pollSettings(options);
    const spinner = ora('Waiting for Magnit to process...').start();
    try {
      const status = await waitForStatus(feed, correlationId, {
        method,
        format,
        intervalMs,
        timeoutMs,
        onTick: (s) => { spinner.text = `Status: ${s.requestStatus}`; },
      });
      spinner.stop();
      if (status.requestStatus.toLowerCase() === 'errored') process.exitCode = 1;
      renderStatus(status, options.output);
    } catch (error) {
      spinner.fail(chalk.red('Stopped waiting.'));
      throw error;
    }
  });

  return cmd;
}
