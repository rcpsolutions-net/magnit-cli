// src/commands/feed/pull.js — Ask Magnit to build an outbound data set
import { Command } from 'commander';
import { getFeed } from '../../lib/feeds.js';
import { MagnitCliError } from '../../lib/errors.js';
import { detectFormat } from '../../lib/payload.js';
import { addRunOptions, runFeed } from './_shared.js';

export default function buildPullCommand() {
  const cmd = new Command('pull')
    .description('Start an outbound feed (worker-outbound, request-outbound). Use --wait to fetch the records.')
    .argument('<feed>', 'Outbound feed name (see `magnit feed list`)')
    .argument('[feedId]', 'Magnit-assigned feed identifier');

  addRunOptions(cmd).action(async (feedName, feedId, options) => {
    const feed = getFeed(feedName);
    if (feed.direction !== 'pull') {
      throw new MagnitCliError(`"${feed.name}" is an inbound feed.`, `Use \`magnit feed submit ${feed.name} --file <payload>\` instead.`);
    }
    const format = detectFormat({ explicit: options.format });
    await runFeed(feed, feedId, { format }, options);
  });

  return cmd;
}
