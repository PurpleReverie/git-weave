#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('weave')
  .description('Git-aware CLI for managing child repositories')
  .version('0.1.0');

program
  .command('init')
  .description('Scan for .thread files, update git exclude, and install git hooks')
  .action(() => {
    console.log('init invoked');
  });

program
  .command('sync')
  .description('Sync all child repos declared in .thread files')
  .action(() => {
    console.log('sync invoked');
  });

program
  .command('lock')
  .description('Pin all child repos to their current HEAD hash')
  .action(() => {
    console.log('lock invoked');
  });

program
  .command('unlock [path]')
  .description('Clear the pinned hash for a child repo, returning it to latest-tracking')
  .action((path) => {
    console.log('unlock invoked', path ?? '(all)');
  });

program
  .command('ignore')
  .description('Refresh .git/info/exclude entries based on current .thread files')
  .action(() => {
    console.log('ignore invoked');
  });

program.parse();
