// src/lib/helpers.js — Shared output + error rendering (same helpers as bh-cli, Magnit error handling).

import Table from 'cli-table3';
import chalk from 'chalk';
import { MagnitCliError } from './errors.js';

/** Write `data` as pretty-printed JSON to stdout. */
export function renderJsonOutput(data) {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Render rows with cli-table3.
 * @param {Array<Record<string, unknown>>} records
 * @param {string[]} [headers] defaults to the union of keys across all records
 */
export function renderTableOutput(records, headers = null, tableOpts = {}) {
  const columns = headers ?? [...new Set(records.flatMap((r) => Object.keys(r)))];
  const table = new Table({ head: columns.map((h) => chalk.cyan.bold(String(h))), ...tableOpts });
  for (const record of records) {
    table.push(columns.map((h) => {
      const value = record[h];
      return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
    }));
  }
  console.log(table.toString());
}

/** Print label/value pairs, one per line. */
export function renderKeyValues(pairs) {
  for (const [label, value] of pairs) console.log(`  ${chalk.cyan.bold(label)}: ${value}`);
}

const HINTS = {
  400: 'Request is invalid (malformed XML/JSON, missing parameters, or an unknown/expired correlation ID).',
  401: 'Authorization failed. Run `magnit auth login` again.',
  500: 'Magnit reported an error processing the request, or you are not authorized for this endpoint.',
};

/** Print any error thrown by the CLI. Returns nothing; caller exits. */
export function renderError(error) {
  if (error instanceof MagnitCliError) {
    console.error(chalk.red(error.message));
    if (error.hint) console.error(chalk.yellow(error.hint));
    return;
  }
  if (error.response) {
    const { status, data } = error.response;
    const text = typeof data === 'object' && data !== null ? JSON.stringify(data) : String(data ?? '').trim();
    console.error(chalk.red(`Error ${status}: ${text || 'No response body.'}`));
    if (HINTS[status]) console.error(chalk.yellow(HINTS[status]));
    return;
  }
  console.error(chalk.red(`An unexpected error occurred: ${error.message}`));
}
