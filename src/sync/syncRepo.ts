import { access, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { simpleGit } from 'simple-git';
import { config as loadEnv } from 'dotenv';
import { ResolvedThread } from '../types.js';
import { resolveRepoUrl } from './resolveAuth.js';
import { checkDirtyState } from '../git/checkDirtyState.js';
import { parseWeaveConfig } from '../config/parseWeaveConfig.js';
import { scanThreadFiles } from '../config/scanThreadFiles.js';
import { targetDirForThread } from './targetDir.js';

export type SyncStatus = 'cloned' | 'updated' | 'skipped' | 'failed';

export interface SyncResult {
  filePath: string;
  targetDir: string;
  status: SyncStatus;
  error?: string;
}

const MAX_DEPTH = 3;

async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// `.git` can be a directory (normal clone) or a file (worktree/submodule pointer).
// access() succeeds for both, which is all we need to confirm this is a git repo root.
async function isGitRepo(path: string): Promise<boolean> {
  return dirExists(join(path, '.git'));
}

async function syncNestedThreads(targetDir: string, depth: number, rootEnvPath: string): Promise<void> {
  if (depth >= MAX_DEPTH) return;

  // Always re-apply the root .env so nested repos can resolve aliases
  loadEnv({ path: rootEnvPath, quiet: true, override: false });

  let nestedThreads;
  try {
    const nestedConfig = await parseWeaveConfig(targetDir);
    nestedThreads = await scanThreadFiles(targetDir, nestedConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  warning: could not read nested config in ${targetDir}: ${message}`);
    return;
  }

  if (nestedThreads.length === 0) return;

  const indent = '  '.repeat(depth + 1);
  for (const nested of nestedThreads) {
    process.stdout.write(`${indent}${nested.thread.repo} ... `);
    const result = await syncRepo(nested, depth + 1, rootEnvPath);
    if (result.status === 'failed' || result.status === 'skipped') {
      console.log(`${result.status}\n${indent}  ${result.error}`);
    } else {
      console.log(result.status);
    }
  }
}

export async function syncRepo(resolved: ResolvedThread, depth = 0, rootEnvPath = join(process.cwd(), '.env')): Promise<SyncResult> {
  const { filePath, thread } = resolved;
  const targetDir = targetDirForThread(filePath);
  const repoUrl = resolveRepoUrl(thread.repo, thread.alias);

  try {
    // If the target dir exists but has no .git, simple-git would walk up and
    // operate on the *parent* repo — falsely reporting the child as dirty.
    // Recover automatically when the dir is empty; refuse otherwise so we
    // don't blow away user data sitting in a placeholder directory.
    if (await dirExists(targetDir) && !await isGitRepo(targetDir)) {
      const entries = await readdir(targetDir);
      if (entries.length > 0) {
        return {
          filePath,
          targetDir,
          status: 'failed',
          error: `${targetDir} exists but is not a git repo (contains ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}); remove it and re-run`,
        };
      }
      await rm(targetDir, { recursive: true, force: true });
    }

    if (!await dirExists(targetDir)) {
      // --branch lands the clone on thread.branch instead of whatever the
      // remote's default HEAD points at. All refs are still fetched, so a
      // later checkout(hash) onto a commit on another branch still works.
      await simpleGit().clone(repoUrl, targetDir, ['--branch', thread.branch]);

      try {
        if (thread.hash) {
          await simpleGit(targetDir).checkout(thread.hash);
        }
        await syncNestedThreads(targetDir, depth, rootEnvPath);
      } catch (err) {
        // Clean up the partially-initialised directory so the next sync
        // retries a full clone rather than stumbling over corrupt state.
        await rm(targetDir, { recursive: true, force: true });
        throw err;
      }

      return { filePath, targetDir, status: 'cloned' };
    }

    const dirty = await checkDirtyState(targetDir);
    if (!dirty.clean) {
      return { filePath, targetDir, status: 'skipped', error: dirty.reason };
    }

    const git = simpleGit(targetDir);
    await git.fetch();

    if (thread.hash) {
      await git.checkout(thread.hash);
    } else {
      await git.checkout(thread.branch);
      await git.pull();
    }

    await syncNestedThreads(targetDir, depth, rootEnvPath);
    return { filePath, targetDir, status: 'updated' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { filePath, targetDir, status: 'failed', error: message };
  }
}
