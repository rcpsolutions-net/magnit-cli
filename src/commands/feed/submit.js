// src/commands/feed/submit.js — Push a payload to a feed
import { Command } from 'commander';
import { getFeed } from '../../lib/feeds.js';
import { MagnitCliError } from '../../lib/errors.js';
import { readPayloadFile } from '../../lib/payload.js';
import { addRunOptions, runFeed } from './_shared.js';

export default function buildSubmitCommand() {
  const cmd = new Command('submit')
    .description('Push a JSON/XML payload to a feed. Async: returns a correlation ID (use --wait to poll).')
    .argument('<feed>', 'Feed name (see `magnit feed list`)')
    .argument('[feedId]', 'Magnit-assigned feed identifier, for feeds that take one')
    .requiredOption('-f, --file <path>', 'Payload file (.json or .xml)');

  addRunOptions(cmd).action(async (feedName, feedId, options) => {
    const feed = getFeed(feedName);
    if (feed.direction !== 'push') {
      throw new MagnitCliError(`"${feed.name}" is an outbound feed.`, `Use \`magnit feed pull ${feed.name}\` instead.`);
    }
    const { content, format } = readPayloadFile(options.file, options.format);
    await runFeed(feed, feedId, { body: content, format }, options);
  });

  return cmd;
}
