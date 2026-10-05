// src/commands/feed/list.js — Show the feed registry (no API call)
import { Command } from 'commander';
import chalk from 'chalk';
import { FEEDS } from '../../lib/feeds.js';
import { renderJsonOutput, renderTableOutput } from '../../lib/helpers.js';

export default function buildListCommand() {
  return new Command('list')
    .description('List known feeds, their endpoints, and what still needs verifying against the real API.')
    .option('-o, --output <format>', 'Output format: table or json', 'table')
    .action((options) => {
      if (options.output === 'json') {
        renderJsonOutput(FEEDS);
        return;
      }

      const rows = Object.entries(FEEDS).map(([name, f]) => ({
        Feed: name,
        Direction: f.direction,
        Endpoint: `${f.path}${f.feedId ? '/<feedId>' : ''}`,
        Status: `${(f.statusStyle).toUpperCase()} ${f.statusPath ?? `${f.statusBase}/request-status`}`,
        Verify: f.verify.length ? chalk.yellow(`${f.verify.length} note(s)`) : chalk.green('documented'),
      }));
      renderTableOutput(rows);

      const notes = [...new Set(Object.values(FEEDS).flatMap((f) => f.verify))];
      console.log(chalk.bold('\nTo verify against the real API:'));
      for (const note of notes) console.log(`  - ${note}`);
    });
}
