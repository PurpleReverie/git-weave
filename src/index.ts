#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { Command } from 'commander';

loadEnv({ quiet: true }); // load .env from cwd; shell env takes priority (override: false is the default)

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error('git-weave requires Node.js 18 or higher.');
  process.exit(1);
}
import { parseWeaveConfig } from './config/parseWeaveConfig.js';
import { scanThreadFiles } from './config/scanThreadFiles.js';
import { syncRepo } from './sync/syncRepo.js';
import { assertGitRepo } from './git/assertGitRepo.js';
import { updateExclude } from './git/updateExclude.js';
import { findOrphans, cleanOrphans } from './sync/cleanOrphans.js';
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
      const scanned = config.scan.length === 1 && config.scan[0] === '.'
        ? 'this repository'
        : `scan paths: ${config.scan.join(', ')}`;
      console.log(`No .thread files found under ${scanned}.`);
      console.log('Create one alongside where a child repo should live, e.g. services/api.thread');
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
  .option('--force', 'Pin even if HEAD is not yet pushed to a remote branch')
  .action(async (opts: { force?: boolean }) => {
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
        const hash = await lockThread(resolved, { force: !!opts.force });
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
  .command('clean')
  .description('Remove cloned child directories whose .thread file no longer exists')
  .option('--apply', 'Actually remove orphans (default is a dry run)')
  .option('--force', 'Remove orphans even if dirty, unpushed, or non-git; implies --apply')
  .action(async (opts: { apply?: boolean; force?: boolean }) => {
    const cwd = process.cwd();
    const gitRoot = await assertGitRepo(cwd);
    const config = await parseWeaveConfig(cwd);
    const threads = await scanThreadFiles(cwd, config);

    const orphans = await findOrphans(gitRoot, config, threads);
    if (orphans.length === 0) {
      console.log('No orphans found.');
      return;
    }

    const apply = !!(opts.apply || opts.force);
    if (!apply) {
      console.log(`Found ${orphans.length} orphan${orphans.length === 1 ? '' : 's'} (dry run — re-run with --apply to remove):`);
    }

    const result = await cleanOrphans(orphans, { apply, force: !!opts.force });

    for (const orphan of orphans) {
      const removed = result.removed.includes(orphan.path);
      const skip = result.skipped.find(s => s.path === orphan.path);
      const detail = orphan.detail ? ` (${orphan.detail})` : '';
      let action: string;
      if (removed) action = apply ? 'removed' : 'would remove';
      else if (skip) action = `skipped — ${skip.reason}`;
      else action = 'unchanged';
      console.log(`  ${orphan.path} — ${orphan.status}${detail} → ${action}`);
    }

    if (apply && result.removed.length > 0) {
      // Rebuild the exclude block so stale entries are dropped together with the dirs.
      await updateExclude(gitRoot, threads, config);
    }
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
