import { access } from 'fs/promises';
import { join, basename } from 'path';
import { simpleGit } from 'simple-git';
import { config as loadEnv } from 'dotenv';
import { ResolvedThread } from '../types.js';
import { resolveRepoUrl } from './resolveAuth.js';
import { checkDirtyState } from '../git/checkDirtyState.js';
import { parseWeaveConfig } from '../config/parseWeaveConfig.js';
import { scanThreadFiles } from '../config/scanThreadFiles.js';

export type SyncStatus = 'cloned' | 'updated' | 'skipped' | 'failed';

export interface SyncResult {
  filePath: string;
  targetDir: string;
  status: SyncStatus;
  error?: string;
}

const MAX_DEPTH = 3;

function targetDirForThread(filePath: string): string {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  const name = basename(filePath, '.thread');
  return join(dir, name);
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function syncNestedThreads(targetDir: string, depth: number, rootEnvPath: string): Promise<void> {
  if (depth >= MAX_DEPTH) return;

  // Always re-apply the root .env so nested repos can resolve aliases
  loadEnv({ path: rootEnvPath, quiet: true, override: false });

  let nestedThreads;
  try {
    const nestedConfig = await parseWeaveConfig(targetDir);
    nestedThreads = await scanThreadFiles(targetDir, nestedConfig);
  } catch {
    return; // no .thread files or unreadable — skip silently
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
    if (!await dirExists(targetDir)) {
      await simpleGit().clone(repoUrl, targetDir);

      if (thread.hash) {
        await simpleGit(targetDir).checkout(thread.hash);
      }

      await syncNestedThreads(targetDir, depth, rootEnvPath);
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
