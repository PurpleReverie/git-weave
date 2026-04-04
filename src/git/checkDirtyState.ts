import { simpleGit } from 'simple-git';

export type DirtyReason = 'uncommitted-changes' | 'unpushed-commits' | 'ahead-of-pinned-hash';

export interface DirtyStateResult {
  clean: boolean;
  reason?: DirtyReason;
}

export async function checkDirtyState(dir: string, pinnedHash?: string | null): Promise<DirtyStateResult> {
  const git = simpleGit(dir);

  const status = await git.status();
  if (!status.isClean()) {
    return { clean: false, reason: 'uncommitted-changes' };
  }

  if (pinnedHash) {
    const head = await git.revparse(['HEAD']);
    if (head.trim() !== pinnedHash.trim()) {
      return { clean: false, reason: 'ahead-of-pinned-hash' };
    }
  }

  const log = await git.log(['@{u}..HEAD']).catch(() => null);
  if (log && log.total > 0) {
    return { clean: false, reason: 'unpushed-commits' };
  }

  return { clean: true };
}
