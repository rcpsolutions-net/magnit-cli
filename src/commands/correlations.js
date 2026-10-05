// src/commands/correlations.js — Recent correlation IDs recorded locally
import { Command } from 'commander';
import chalk from 'chalk';
import { clearCorrelations, listCorrelations } from '../lib/correlations.js';
import { renderJsonOutput, renderTableOutput } from '../lib/helpers.js';

export default function createCorrelationsCommand() {
  return new Command('correlations')
    .description('List correlation IDs recorded by this CLI (Magnit honours them for 24h).')
    .option('--clear', 'Forget all recorded correlation IDs')
    .option('-o, --output <format>', 'Output format: table or json', 'table')
    .action((options) => {
      if (options.clear) {
        clearCorrelations();
        console.log(chalk.green('Cleared recorded correlation IDs.'));
        return;
      }

      const list = listCorrelations();
      if (options.output === 'json') {
        renderJsonOutput(list);
        return;
      }
      if (!list.length) {
        console.log(chalk.yellow('No correlation IDs recorded yet.'));
        return;
      }
      renderTableOutput(
        list.map((c) => ({
          CorrelationId: c.correlationId,
          Feed: c.feedId ? `${c.feed}/${c.feedId}` : c.feed,
          Kind: c.kind,
          'Last status': c.status,
          Created: c.createdAt,
          Expired: c.expired ? chalk.red('yes') : 'no',
        })),
      );
    });
}
