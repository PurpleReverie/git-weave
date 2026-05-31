import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, relative } from 'path';
import { ResolvedThread, WeaveConfig } from '../types.js';
import { targetDirForThread } from '../sync/targetDir.js';

const BLOCK_START = '# weave managed — do not edit this block manually';
const BLOCK_END = '# end weave';

function excludePath(gitRoot: string, config: WeaveConfig): string {
  return config.exclude === 'git-info'
    ? join(gitRoot, '.git', 'info', 'exclude')
    : join(gitRoot, '.gitignore');
}

export async function readExcludeEntries(gitRoot: string, config: WeaveConfig): Promise<string[]> {
  let content: string;
  try {
    content = await readFile(excludePath(gitRoot, config), 'utf-8');
  } catch {
    return [];
  }

  const entries: string[] = [];
  let inBlock = false;
  for (const line of content.split('\n')) {
    if (line === BLOCK_START) { inBlock = true; continue; }
    if (line === BLOCK_END) { inBlock = false; continue; }
    if (inBlock && line.trim() !== '') entries.push(line);
  }
  return entries;
}

function buildBlock(entries: string[]): string {
  if (entries.length === 0) return '';
  return [BLOCK_START, ...entries, BLOCK_END].join('\n') + '\n';
}

// Removes the weave-managed block from existing file content while leaving
// everything else untouched. Uses inBlock as a simple state machine gate.
function stripBlock(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    if (line === BLOCK_START) { inBlock = true; continue; }
    if (line === BLOCK_END) { inBlock = false; continue; }
    if (!inBlock) result.push(line);
  }

  return result.join('\n');
}

export async function updateExclude(
  gitRoot: string,
  threads: ResolvedThread[],
  config: WeaveConfig
): Promise<void> {
  const useGitInfo = config.exclude === 'git-info';
  const path = excludePath(gitRoot, config);

  if (useGitInfo) {
    await mkdir(join(gitRoot, '.git', 'info'), { recursive: true });
  }

  let existing = '';
  try {
    existing = await readFile(path, 'utf-8');
  } catch {
    // File doesn't exist yet — start fresh
  }

  const entries = threads.map(t => relative(gitRoot, targetDirForThread(t.filePath)));
  // trimEnd ensures no trailing blank lines between existing content and the managed block.
  const stripped = stripBlock(existing).trimEnd();
  const block = buildBlock(entries);
  // Conditional join avoids a leading newline when the file is new/empty.
  const updated = stripped ? `${stripped}\n${block}` : block;

  await writeFile(path, updated, 'utf-8');
}
