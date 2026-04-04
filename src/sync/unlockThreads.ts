import { readFile, writeFile } from 'fs/promises';
import { ResolvedThread } from '../types.js';

export async function unlockThread(resolved: ResolvedThread): Promise<void> {
  const raw = await readFile(resolved.filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  delete parsed.hash;
  await writeFile(resolved.filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
}
