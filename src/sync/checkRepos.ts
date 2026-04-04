import { simpleGit } from 'simple-git';
import { access } from 'fs/promises';
import { join, basename } from 'path';
import { ResolvedThread } from '../types.js';

export type CheckStatus = 'ok' | 'missing' | 'uncommitted-changes' | 'unpushed-commits' | 'wrong-hash';

export interface CheckResult {
  filePath: string;
  targetDir: string;
  status: CheckStatus;
  detail?: string;
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function targetDirForThread(filePath: string): string {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  const name = basename(filePath, '.thread');
  return join(dir, name);
}

export async function checkRepo(resolved: ResolvedThread): Promise<CheckResult> {
  const { filePath, thread } = resolved;
  const targetDir = targetDirForThread(filePath);

  if (!await dirExists(targetDir)) {
    return { filePath, targetDir, status: 'missing', detail: 'directory not found — run weave sync' };
  }

  const git = simpleGit(targetDir);

  const status = await git.status();
  if (!status.isClean()) {
    return { filePath, targetDir, status: 'uncommitted-changes', detail: 'child repo has uncommitted changes' };
  }

  const log = await git.log(['@{u}..HEAD']).catch(() => null);
  if (log && log.total > 0) {
    return { filePath, targetDir, status: 'unpushed-commits', detail: `child repo has ${log.total} unpushed commit(s)` };
  }

  const headHash = (await git.revparse(['HEAD'])).trim();

  if (thread.hash) {
    const expectedHash = (await git.revparse([thread.hash])).trim();
    if (headHash !== expectedHash) {
      return {
        filePath,
        targetDir,
        status: 'wrong-hash',
        detail: `expected ${thread.hash} (${expectedHash.slice(0, 7)}) but HEAD is ${headHash.slice(0, 7)}`,
      };
    }
  } else {
    await git.fetch();
    const remoteHash = (await git.revparse([`origin/${thread.branch}`])).trim();
    if (headHash !== remoteHash) {
      return {
        filePath,
        targetDir,
        status: 'wrong-hash',
        detail: `behind origin/${thread.branch} — run weave sync`,
      };
    }
  }

  return { filePath, targetDir, status: 'ok' };
}

export async function checkRepos(threads: ResolvedThread[]): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const resolved of threads) {
    results.push(await checkRepo(resolved));
  }
  return results;
}
