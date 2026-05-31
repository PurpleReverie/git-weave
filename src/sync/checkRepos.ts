import { simpleGit } from 'simple-git';
import { access } from 'fs/promises';
import { join } from 'path';
import { ResolvedThread } from '../types.js';
import { targetDirForThread } from './targetDir.js';

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

export async function checkRepo(resolved: ResolvedThread): Promise<CheckResult> {
  const { filePath, thread } = resolved;
  const targetDir = targetDirForThread(filePath);

  if (!await dirExists(targetDir)) {
    return { filePath, targetDir, status: 'missing', detail: 'directory not found — run weave sync' };
  }

  // Without this guard, simple-git would walk up and run against the parent repo.
  if (!await dirExists(join(targetDir, '.git'))) {
    return { filePath, targetDir, status: 'missing', detail: 'directory exists but is not a git repo — run weave sync' };
  }

  const git = simpleGit(targetDir);

  const status = await git.status();
  if (!status.isClean()) {
    return { filePath, targetDir, status: 'uncommitted-changes', detail: 'child repo has uncommitted changes' };
  }

  // @{u}..HEAD lists commits ahead of the upstream tracking branch.
  // .catch handles repos with no upstream configured (detached HEAD, no remote).
  const log = await git.log(['@{u}..HEAD']).catch(() => null);
  if (log && log.total > 0) {
    return { filePath, targetDir, status: 'unpushed-commits', detail: `child repo has ${log.total} unpushed commit(s)` };
  }

  const headHash = (await git.revparse(['HEAD'])).trim();

  if (thread.hash) {
    // revparse resolves any ref (abbreviated SHA, tag, branch) to a full commit SHA
    // so the comparison is canonical even if thread.hash is a short hash or tag name.
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
    // Fetch first so origin/<branch> reflects the actual remote tip before comparing.
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
