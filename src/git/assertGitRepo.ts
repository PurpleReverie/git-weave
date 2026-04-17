import { access } from 'fs/promises';
import { join, dirname } from 'path';

async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function assertGitRepo(cwd: string): Promise<string> {
  let current = cwd;

  while (true) {
    if (await dirExists(join(current, '.git'))) {
      return current;
    }

    const parent = dirname(current);
    // dirname('/') === '/' — equality means we've hit the filesystem root
    if (parent === current) {
      throw new Error('weave must be run inside a git repository');
    }

    current = parent;
  }
}
