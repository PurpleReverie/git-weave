import { readFile, writeFile, rename } from 'fs/promises';
import { ResolvedThread } from '../types.js';

async function writeJsonAtomic(filePath: string, data: object): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  await rename(tmp, filePath);
}

export async function unlockThread(resolved: ResolvedThread): Promise<void> {
  const raw = await readFile(resolved.filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  delete parsed.hash;
  await writeJsonAtomic(resolved.filePath, parsed);
}
