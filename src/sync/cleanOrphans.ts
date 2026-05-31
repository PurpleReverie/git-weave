import { access, readdir, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { ResolvedThread, WeaveConfig } from '../types.js';
import { checkDirtyState } from '../git/checkDirtyState.js';
import { readExcludeEntries } from '../git/updateExclude.js';
import { targetDirForThread } from './targetDir.js';

export type OrphanStatus =
  | 'missing'           // exclude entry, but nothing on disk
  | 'clean'             // git repo with no uncommitted/unpushed changes
  | 'dirty'             // uncommitted changes
  | 'unpushed'          // commits not yet pushed
  | 'not-a-git-repo';   // a directory exists but has no .git

export interface Orphan {
  path: string;          // relative path as recorded in the exclude block
  absolutePath: string;
  status: OrphanStatus;
  detail?: string;
}

export interface CleanOptions {
  apply: boolean;
  force: boolean;
}

export interface CleanOutcome {
  removed: string[];
  skipped: { path: string; reason: string }[];
}

async function dirExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function findOrphans(
  gitRoot: string,
  config: WeaveConfig,
  threads: ResolvedThread[]
): Promise<Orphan[]> {
  const entries = await readExcludeEntries(gitRoot, config);
  const activeAbs = new Set(threads.map(t => targetDirForThread(t.filePath)));

  const orphans: Orphan[] = [];
  for (const entry of entries) {
    const abs = resolve(gitRoot, entry);
    if (activeAbs.has(abs)) continue;

    if (!await dirExists(abs)) {
      orphans.push({ path: entry, absolutePath: abs, status: 'missing' });
      continue;
    }

    if (!await dirExists(join(abs, '.git'))) {
      const contents = await readdir(abs);
      orphans.push({
        path: entry,
        absolutePath: abs,
        status: 'not-a-git-repo',
        detail: `${contents.length} entr${contents.length === 1 ? 'y' : 'ies'} present`,
      });
      continue;
    }

    const dirty = await checkDirtyState(abs);
    if (dirty.clean) {
      orphans.push({ path: entry, absolutePath: abs, status: 'clean' });
    } else if (dirty.reason === 'uncommitted-changes') {
      orphans.push({ path: entry, absolutePath: abs, status: 'dirty' });
    } else if (dirty.reason === 'unpushed-commits') {
      orphans.push({ path: entry, absolutePath: abs, status: 'unpushed' });
    } else {
      // not-a-git-repo from checkDirtyState — shouldn't happen since we checked .git above
      orphans.push({ path: entry, absolutePath: abs, status: 'not-a-git-repo' });
    }
  }

  return orphans;
}

export async function cleanOrphans(orphans: Orphan[], options: CleanOptions): Promise<CleanOutcome> {
  const removed: string[] = [];
  const skipped: { path: string; reason: string }[] = [];

  for (const orphan of orphans) {
    if (orphan.status === 'missing') {
      // No directory to delete; the exclude block will be rebuilt by the caller.
      removed.push(orphan.path);
      continue;
    }

    if (orphan.status === 'not-a-git-repo' && !options.force) {
      skipped.push({ path: orphan.path, reason: 'not a git repo — use --force to remove' });
      continue;
    }

    if ((orphan.status === 'dirty' || orphan.status === 'unpushed') && !options.force) {
      skipped.push({
        path: orphan.path,
        reason: `${orphan.status === 'dirty' ? 'uncommitted changes' : 'unpushed commits'} — use --force to remove`,
      });
      continue;
    }

    // `removed` represents the *decision* to remove; the caller distinguishes
    // dry-run from real run via options.apply when formatting output.
    if (options.apply) {
      await rm(orphan.absolutePath, { recursive: true, force: true });
    }
    removed.push(orphan.path);
  }

  return { removed, skipped };
}
