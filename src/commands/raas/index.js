// src/commands/raas/index.js — Barrel: Reporting as a Service (saved Customizable Reports as JSON)
import { Command } from 'commander';
import { buildLoginCommand, buildLogoutCommand, buildStatusCommand } from './login.js';
import buildReportCommand from './report.js';
import { buildRunCommand, buildCheckCommand, buildFetchCommand } from './run.js';

export default function createRaasCommand() {
  const raas = new Command('raas').description(
    'Pull Magnit Reporting-as-a-Service reports (own host + keys; independent of `magnit auth`)',
  );

  raas.addCommand(buildLoginCommand());
  raas.addCommand(buildLogoutCommand());
  raas.addCommand(buildStatusCommand());
  raas.addCommand(buildReportCommand());
  raas.addCommand(buildRunCommand());
  raas.addCommand(buildCheckCommand());
  raas.addCommand(buildFetchCommand());

  return raas;
}
