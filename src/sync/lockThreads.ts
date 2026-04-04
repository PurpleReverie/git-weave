import { readFile, writeFile } from 'fs/promises';
import { basename } from 'path';
import { simpleGit } from 'simple-git';
import { ResolvedThread } from '../types.js';

function targetDirForThread(filePath: string): string {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  const name = basename(filePath, '.thread');
  return `${dir}/${name}`;
}

export async function lockThread(resolved: ResolvedThread): Promise<string> {
  const targetDir = targetDirForThread(resolved.filePath);
  const git = simpleGit(targetDir);
  const hash = (await git.revparse(['HEAD'])).trim();

  const raw = await readFile(resolved.filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  parsed.hash = hash;
  await writeFile(resolved.filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');

  return hash;
}
