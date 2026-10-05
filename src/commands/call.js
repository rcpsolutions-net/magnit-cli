// src/commands/call.js — Escape hatch: call any Magnit endpoint with the stored session
import { Command } from 'commander';
import chalk from 'chalk';
import { MagnitCliError } from '../lib/errors.js';
import { MIME, detectFormat, parseBody, readPayloadFile } from '../lib/payload.js';
import { sendRaw } from '../lib/engine.js';
import { renderJsonOutput } from '../lib/helpers.js';

export default function createCallCommand() {
  return new Command('call')
    .description('Call any endpoint relative to the base URL, e.g. `magnit call GET costcenter/request-status/<id>`.')
    .argument('<method>', 'GET or POST (the only verbs Magnit supports)')
    .argument('<path>', 'Path relative to the base URL (which already ends in /api/)')
    .option('-f, --file <path>', 'Request body file (.json or .xml)')
    .option('--format <format>', 'json or xml (default: from file extension, else json)')
    .option('--raw', 'Print the response body as returned, without parsing')
    .action(async (method, path, options) => {
      const verb = method.toUpperCase();
      if (!['GET', 'POST'].includes(verb)) {
        throw new MagnitCliError(`Unsupported method "${method}".`, 'The Magnit API supports POST and GET.');
      }

      let data;
      let format = detectFormat({ explicit: options.format });
      if (options.file) {
        ({ content: data, format } = readPayloadFile(options.file, options.format));
      }

      const response = await sendRaw({ method: verb, path, headers: { 'Content-Type': MIME[format] }, data });
      console.error(chalk.gray(`HTTP ${response.status}`));
      if (options.raw) console.log(response.data);
      else renderJsonOutput(parseBody(response.data));
    });
}
