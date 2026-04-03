import { access } from 'fs/promises';
import { join, basename } from 'path';
import { simpleGit } from 'simple-git';
import { ResolvedThread } from '../types.js';

export type SyncStatus = 'cloned' | 'updated' | 'failed';

export interface SyncResult {
  filePath: string;
  targetDir: string;
  status: SyncStatus;
  error?: string;
}

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

export async function syncRepo(resolved: ResolvedThread): Promise<SyncResult> {
  const { filePath, thread } = resolved;
  const targetDir = targetDirForThread(filePath);
  const repoUrl = thread.repo;

  try {
    if (!await dirExists(targetDir)) {
      await simpleGit().clone(repoUrl, targetDir);

      if (thread.hash) {
        await simpleGit(targetDir).checkout(thread.hash);
      }

      return { filePath, targetDir, status: 'cloned' };
    }

    const git = simpleGit(targetDir);
    await git.fetch();

    if (thread.hash) {
      await git.checkout(thread.hash);
    } else {
      await git.checkout(thread.branch);
      await git.pull();
    }

    return { filePath, targetDir, status: 'updated' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { filePath, targetDir, status: 'failed', error: message };
  }
}
