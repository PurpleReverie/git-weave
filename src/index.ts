#!/usr/bin/env node
import { Command } from 'commander';
import { parseWeaveConfig } from './config/parseWeaveConfig.js';
import { scanThreadFiles } from './config/scanThreadFiles.js';
import { syncRepo } from './sync/syncRepo.js';

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
  .action(async () => {
    const cwd = process.cwd();
    const config = await parseWeaveConfig(cwd);
    const threads = await scanThreadFiles(cwd, config);

    if (threads.length === 0) {
      console.log('No .thread files found.');
      return;
    }

    for (const resolved of threads) {
      process.stdout.write(`  ${resolved.thread.repo} ... `);
      const result = await syncRepo(resolved);

      if (result.status === 'failed') {
        console.log(`failed\n    ${result.error}`);
      } else {
        console.log(result.status);
      }
    }
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

program
  .command('hello')
  .description('Hello world test command')
  .action(() => {
    console.log('Hello from weave!');
  });

program
  .command('debug')
  .description('Print parsed config and discovered .thread files')
  .action(async () => {
    const cwd = process.cwd();
    const config = await parseWeaveConfig(cwd);
    const threads = await scanThreadFiles(cwd, config);

    console.log('\n--- weave.json ---');
    console.log(JSON.stringify(config, null, 2));

    console.log('\n--- .thread files ---');
    if (threads.length === 0) {
      console.log('No .thread files found.');
    } else {
      for (const t of threads) {
        console.log(`\n${t.filePath}`);
        console.log(JSON.stringify(t.thread, null, 2));
      }
    }
  });

program.parse();
