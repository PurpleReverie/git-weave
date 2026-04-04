import { simpleGit } from 'simple-git';

export type DirtyReason = 'uncommitted-changes' | 'unpushed-commits';

export interface DirtyStateResult {
  clean: boolean;
  reason?: DirtyReason;
}

export async function checkDirtyState(dir: string): Promise<DirtyStateResult> {
  const git = simpleGit(dir);

  const status = await git.status();
  if (!status.isClean()) {
    return { clean: false, reason: 'uncommitted-changes' };
  }

  const log = await git.log(['@{u}..HEAD']).catch(() => null);
  if (log && log.total > 0) {
    return { clean: false, reason: 'unpushed-commits' };
  }

  return { clean: true };
}
