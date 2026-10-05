// src/commands/raas/_shared.js — Row output for RaaS data (json, table, csv, ndjson), to stdout or a file
import { writeFileSync } from 'node:fs';
import chalk from 'chalk';
import { MagnitCliError } from '../../lib/errors.js';
import { renderJsonOutput, renderTableOutput } from '../../lib/helpers.js';

export const FORMATS = ['json', 'table', 'csv', 'ndjson'];

export function addDataOptions(cmd) {
  return cmd
    .option('-o, --output <format>', `Output format: ${FORMATS.join(', ')}`, 'json')
    .option('--out <file>', 'Write rows to a file instead of stdout')
    .option('--page <n>', 'Page to fetch (default 1)')
    .option('--size <n>', 'Page size (Magnit default 5000, max 20000)')
    .option('--all', 'Fetch every page');
}

export function dataSettings(options) {
  if (!FORMATS.includes(options.output)) {
    throw new MagnitCliError(`Unknown output format "${options.output}".`, `Use one of: ${FORMATS.join(', ')}.`);
  }
  const num = (value, name) => {
    if (value === undefined) return undefined;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) throw new MagnitCliError(`${name} must be a positive integer.`);
    return n;
  };
  return { page: num(options.page, '--page'), size: num(options.size, '--size'), all: Boolean(options.all) };
}

const csvCell = (value) => {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function toCsv(rows) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(','))].join('\n');
}

export function renderRows(rows, { output, out }) {
  if (out) {
    const text = output === 'csv' ? toCsv(rows) : output === 'ndjson' ? rows.map((r) => JSON.stringify(r)).join('\n') : JSON.stringify(rows, null, 2);
    writeFileSync(out, `${text}\n`);
    console.error(chalk.green(`Wrote ${rows.length} row(s) to ${out}.`));
    return;
  }
  if (output === 'table') renderTableOutput(rows);
  else if (output === 'csv') console.log(toCsv(rows));
  else if (output === 'ndjson') for (const row of rows) console.log(JSON.stringify(row));
  else renderJsonOutput(rows);
}
