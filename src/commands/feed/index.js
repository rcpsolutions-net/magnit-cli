// src/commands/feed/index.js — Barrel: Magnit async feed workflow (submit / pull / status / list)
import { Command } from 'commander';
import buildSubmitCommand from './submit.js';
import buildPullCommand from './pull.js';
import buildStatusCommand from './status.js';
import buildListCommand from './list.js';

export default function createFeedCommand() {
  const feed = new Command('feed')
    .alias('feeds')
    .description('Push data to Magnit and pull outbound feeds (asynchronous, tracked by correlation ID)');

  feed.addCommand(buildSubmitCommand());
  feed.addCommand(buildPullCommand());
  feed.addCommand(buildStatusCommand());
  feed.addCommand(buildListCommand());

  return feed;
}
