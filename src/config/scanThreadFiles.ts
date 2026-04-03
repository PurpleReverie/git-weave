import { readdir } from 'fs/promises';
import { join, resolve } from 'path';
import { parseThread } from './parseThread.js';
import { ResolvedThread, WeaveConfig } from '../types.js';

async function findThreadFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new Error(`Cannot read scan directory: ${dir}`);
  }

  const results: string[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.thread')) {
      results.push(join(dir, entry.name));
    }
  }

  return results;
}

export async function scanThreadFiles(cwd: string, config: WeaveConfig): Promise<ResolvedThread[]> {
  const resolved: ResolvedThread[] = [];
  const seen = new Set<string>();

  for (const scanPath of config.scan) {
    const absDir = resolve(cwd, scanPath);

    if (seen.has(absDir)) continue;
    seen.add(absDir);

    const filePaths = await findThreadFiles(absDir);

    for (const filePath of filePaths) {
      const thread = await parseThread(filePath);
      resolved.push({
        filePath,
        directory: absDir,
        thread,
      });
    }
  }

  return resolved;
}
