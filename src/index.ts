#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { Command } from 'commander';

loadEnv({ quiet: true }); // load .env from cwd; shell env takes priority (override: false is the default)
import { parseWeaveConfig } from './config/parseWeaveConfig.js';
import { scanThreadFiles } from './config/scanThreadFiles.js';
import { syncRepo } from './sync/syncRepo.js';
import { assertGitRepo } from './git/assertGitRepo.js';
import { updateExclude } from './git/updateExclude.js';
import { lockThread } from './sync/lockThreads.js';
import { unlockThread } from './sync/unlockThreads.js';
import { installHooks } from './git/installHooks.js';
import { checkRepos } from './sync/checkRepos.js';

const program = new Command();

program
  .name('weave')
  .description('Git-aware CLI for managing child repositories')
  .version('0.1.0');

program
  .command('init')
  .description('Scan for .thread files, update git exclude, and sync child repos')
  .action(async () => {
    const cwd = process.cwd();
    const gitRoot = await assertGitRepo(cwd);
    const config = await parseWeaveConfig(cwd);
    const threads = await scanThreadFiles(cwd, config);

    if (threads.length === 0) {
      console.log('No .thread files found.');
      return;
    }

    await updateExclude(gitRoot, threads, config);
    console.log(`Updated exclude file with ${threads.length} entr${threads.length === 1 ? 'y' : 'ies'}.`);

    await installHooks(gitRoot, config);
    console.log('Installed git hooks.');

    console.log('Syncing child repos...');
    for (const resolved of threads) {
      process.stdout.write(`  ${resolved.thread.repo} ... `);
      const result = await syncRepo(resolved);
      if (result.status === 'failed' || result.status === 'skipped') {
        console.log(`${result.status}\n    ${result.error}`);
      } else {
        console.log(result.status);
      }
    }
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

      if (result.status === 'failed' || result.status === 'skipped') {
        console.log(`${result.status}\n    ${result.error}`);
      } else {
        console.log(result.status);
      }
    }
  });

program
  .command('lock')
  .description('Pin all child repos to their current HEAD hash')
  .action(async () => {
    const cwd = process.cwd();
    const config = await parseWeaveConfig(cwd);
    const threads = await scanThreadFiles(cwd, config);

    if (threads.length === 0) {
      console.log('No .thread files found.');
      return;
    }

    for (const resolved of threads) {
      process.stdout.write(`  ${resolved.filePath} ... `);
      try {
        const hash = await lockThread(resolved);
        console.log(hash.slice(0, 7));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`failed\n    ${message}`);
      }
    }
  });

program
  .command('unlock [path]')
  .description('Clear the pinned hash for a child repo, returning it to latest-tracking')
  .action(async (path?: string) => {
    const cwd = process.cwd();
    const config = await parseWeaveConfig(cwd);
    const threads = await scanThreadFiles(cwd, config);

    if (threads.length === 0) {
      console.log('No .thread files found.');
      return;
    }

    const targets = path
      ? threads.filter(t => t.filePath.includes(path))
      : threads;

    if (targets.length === 0) {
      console.log(`No .thread files matched: ${path}`);
      return;
    }

    for (const resolved of targets) {
      await unlockThread(resolved);
      console.log(`  ${resolved.filePath} ... unlocked`);
    }
  });

program
  .command('check')
  .description('Verify all child repos are clean and at the correct hash/branch')
  .action(async () => {
    const cwd = process.cwd();
    const config = await parseWeaveConfig(cwd);
    const threads = await scanThreadFiles(cwd, config);

    if (threads.length === 0) {
      console.log('No .thread files found.');
      return;
    }

    const results = await checkRepos(threads);
    let failed = false;

    for (const result of results) {
      if (result.status === 'ok') {
        console.log(`  ${result.filePath} ... ok`);
      } else {
        console.log(`  ${result.filePath} ... ${result.status}\n    ${result.detail}`);
        failed = true;
      }
    }

    if (failed) {
      process.exit(1);
    }
  });

program
  .command('ignore')
  .description('Refresh .git/info/exclude entries based on current .thread files')
  .action(async () => {
    const cwd = process.cwd();
    const gitRoot = await assertGitRepo(cwd);
    const config = await parseWeaveConfig(cwd);
    const threads = await scanThreadFiles(cwd, config);

    await updateExclude(gitRoot, threads, config);
    console.log(`Updated exclude file with ${threads.length} entr${threads.length === 1 ? 'y' : 'ies'}.`);
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
