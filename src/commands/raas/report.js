// src/commands/raas/report.js — Saved Customizable Reports (URLs come from the report's "RaaS" window)
import { Command } from 'commander';
import chalk from 'chalk';
import { MagnitCliError } from '../../lib/errors.js';
import { renderJsonOutput, renderTableOutput } from '../../lib/helpers.js';
import { VERIFY, getReports, removeReport, reportUrls, saveReport } from '../../lib/raas.js';

export default function buildReportCommand() {
  const report = new Command('report').description('Manage saved RaaS reports (name -> endpoint URLs)');

  report
    .command('add')
    .description('Save a report. Copy the request URL from the report\'s RaaS window in the Magnit Platform.')
    .argument('<name>', 'Your name for the report, e.g. timecards')
    .requiredOption('--request-url <url>', 'POST endpoint that requests the report (returns a runid)')
    .option('--status-url <url>', 'GET status endpoint; use {runid} as the placeholder (default: <request-url>/{runid})')
    .option('--data-url <url>', 'GET data endpoint; use {runid} as the placeholder (default: <request-url>/{runid}/retrievePagedData)')
    .action((name, options) => {
      for (const [flag, value] of [['--request-url', options.requestUrl], ['--status-url', options.statusUrl], ['--data-url', options.dataUrl]]) {
        if (value && !/^https?:\/\//i.test(value)) throw new MagnitCliError(`${flag} must be a full http(s) URL.`);
      }
      saveReport(name, { requestUrl: options.requestUrl, statusUrl: options.statusUrl, dataUrl: options.dataUrl });
      const { inferred } = reportUrls({ requestUrl: options.requestUrl, statusUrl: options.statusUrl, dataUrl: options.dataUrl });
      console.log(chalk.green(`Saved report "${name}".`));
      if (inferred.length) {
        console.log(chalk.yellow(`Derived from the documented URL pattern (not confirmed): ${inferred.join(', ')}. Override with --status-url / --data-url if a run fails.`));
      }
    });

  report
    .command('list')
    .description('List saved reports and the URLs that will be called.')
    .option('-o, --output <format>', 'Output format: table or json', 'table')
    .action((options) => {
      const rows = Object.entries(getReports()).map(([name, r]) => {
        const urls = reportUrls(r);
        return { name, request: urls.requestUrl, status: urls.statusUrl, data: urls.dataUrl, inferred: urls.inferred.join(', ') };
      });
      if (options.output === 'json') {
        renderJsonOutput({ reports: rows, verify: VERIFY });
        return;
      }
      if (!rows.length) console.log(chalk.yellow('No saved reports. Add one with `magnit raas report add <name> --request-url <url>`.'));
      else renderTableOutput(rows);
      console.log(chalk.bold('\nStill to verify against the real RaaS:'));
      for (const item of VERIFY) console.log(`  - ${item}`);
    });

  report
    .command('remove')
    .description('Forget a saved report.')
    .argument('<name>')
    .action((name) => {
      if (!removeReport(name)) throw new MagnitCliError(`Unknown report "${name}".`);
      console.log(chalk.green(`Removed "${name}".`));
    });

  return report;
}
