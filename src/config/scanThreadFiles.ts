import { readdir } from 'fs/promises';
import { join, resolve } from 'path';
import { parseThread } from './parseThread.js';
import { ResolvedThread, WeaveConfig } from '../types.js';

const SKIP_DIRS = new Set(['.git', 'node_modules']);

async function findThreadFiles(dir: string, isRoot = true): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    if (isRoot) throw new Error(`Cannot read scan directory: ${dir}`);
    return []; // unreadable subdir mid-walk: skip rather than abort the whole scan
  }

  // Don't descend into nested git repos — those are either cloned children
  // (handled by syncNestedThreads) or unrelated repos that shouldn't be touched.
  if (!isRoot && entries.some(e => e.name === '.git')) {
    return [];
  }

  const results: string[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.thread')) {
      results.push(join(dir, entry.name));
      continue;
    }
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      const nested = await findThreadFiles(join(dir, entry.name), false);
      results.push(...nested);
    }
  }

  return results;
}

export async function scanThreadFiles(cwd: string, config: WeaveConfig): Promise<ResolvedThread[]> {
  const resolved: ResolvedThread[] = [];
  const seenFiles = new Set<string>();

  for (const scanPath of config.scan) {
    const absDir = resolve(cwd, scanPath);
    const filePaths = await findThreadFiles(absDir);

    for (const filePath of filePaths) {
      if (seenFiles.has(filePath)) continue;
      seenFiles.add(filePath);
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
