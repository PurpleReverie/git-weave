import { simpleGit } from 'simple-git';
import { access } from 'fs/promises';
import { join } from 'path';
import { ResolvedThread, WeaveConfig } from '../types.js';
import { targetDirForThread } from './targetDir.js';

export type CheckStatus = 'ok' | 'missing' | 'uncommitted-changes' | 'unpushed-commits' | 'wrong-hash' | 'branch-diverged';

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

export async function checkRepo(resolved: ResolvedThread, config: WeaveConfig): Promise<CheckResult> {
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

  // With allowDirty set, local work in a child (uncommitted changes or unpushed
  // commits) is treated as in-sync so the pre-push hook won't block. We return
  // early — once a repo is being actively worked on, hash/branch policing would
  // only get in the way. A clean checkout (e.g. CI) skips this and is verified
  // normally, so the relaxation only ever applies while you're mid-change.
  const status = await git.status();
  if (!status.isClean()) {
    if (config.allowDirty) {
      return { filePath, targetDir, status: 'ok' };
    }
    return { filePath, targetDir, status: 'uncommitted-changes', detail: 'child repo has uncommitted changes' };
  }

  // @{u}..HEAD lists commits ahead of the upstream tracking branch.
  // .catch handles repos with no upstream configured (detached HEAD, no remote).
  const log = await git.log(['@{u}..HEAD']).catch(() => null);
  if (log && log.total > 0) {
    if (config.allowDirty) {
      return { filePath, targetDir, status: 'ok' };
    }
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
    // status.current is the checked-out branch name (null when detached HEAD).
    const currentBranch = status.current;
    if (currentBranch && currentBranch !== thread.branch) {
      if (config.ignoreBranchDivergence) {
        // Developer is intentionally on another branch; it's clean and pushed,
        // so honour the config and treat it as in-sync.
        return { filePath, targetDir, status: 'ok' };
      }
      return {
        filePath,
        targetDir,
        status: 'branch-diverged',
        detail: `on branch ${currentBranch}, expected ${thread.branch} — run weave sync or set ignoreBranchDivergence in weave.json`,
      };
    }

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

export async function checkRepos(threads: ResolvedThread[], config: WeaveConfig): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const resolved of threads) {
    results.push(await checkRepo(resolved, config));
  }
  return results;
}
