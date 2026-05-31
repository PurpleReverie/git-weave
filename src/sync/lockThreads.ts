import { readFile, writeFile, rename } from 'fs/promises';
import { simpleGit } from 'simple-git';
import { ResolvedThread } from '../types.js';
import { targetDirForThread } from './targetDir.js';

async function writeJsonAtomic(filePath: string, data: object): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  await rename(tmp, filePath);
}

export interface LockOptions {
  force: boolean;
}

export async function lockThread(resolved: ResolvedThread, options: LockOptions = { force: false }): Promise<string> {
  const targetDir = targetDirForThread(resolved.filePath);
  const git = simpleGit(targetDir);
  const hash = (await git.revparse(['HEAD'])).trim();

  if (!options.force) {
    // `git branch -r --contains <hash>` lists remote-tracking branches that contain
    // the commit. If empty, the commit only exists locally — pinning it means
    // anyone else syncing the parent repo will fail to check it out.
    const remoteRefs = (await git.raw(['branch', '-r', '--contains', hash])).trim();
    if (!remoteRefs) {
      throw new Error(`HEAD (${hash.slice(0, 7)}) is not on any remote branch — push first, or re-run with --force`);
    }
  }

  const raw = await readFile(resolved.filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  parsed.hash = hash;
  await writeJsonAtomic(resolved.filePath, parsed);

  return hash;
}
