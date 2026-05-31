import { simpleGit } from 'simple-git';
import { access } from 'fs/promises';
import { join } from 'path';

export type DirtyReason = 'uncommitted-changes' | 'unpushed-commits' | 'not-a-git-repo';

export interface DirtyStateResult {
  clean: boolean;
  reason?: DirtyReason;
}

export async function checkDirtyState(dir: string): Promise<DirtyStateResult> {
  // Without this guard, simple-git would walk up to the parent repo's .git
  // and report the parent's status against the child — a misleading false positive.
  try {
    await access(join(dir, '.git'));
  } catch {
    return { clean: false, reason: 'not-a-git-repo' };
  }

  const git = simpleGit(dir);

  const status = await git.status();
  if (!status.isClean()) {
    return { clean: false, reason: 'uncommitted-changes' };
  }

  // @{u}..HEAD lists commits ahead of the upstream tracking branch.
  // .catch handles repos with no upstream configured (detached HEAD, no remote).
  const log = await git.log(['@{u}..HEAD']).catch(() => null);
  if (log && log.total > 0) {
    return { clean: false, reason: 'unpushed-commits' };
  }

  return { clean: true };
}
