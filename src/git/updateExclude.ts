import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename, relative } from 'path';
import { ResolvedThread, WeaveConfig } from '../types.js';

const BLOCK_START = '# weave managed — do not edit this block manually';
const BLOCK_END = '# end weave';

function targetDirForThread(filePath: string, gitRoot: string): string {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  const name = basename(filePath, '.thread');
  const abs = join(dir, name);
  return relative(gitRoot, abs);
}

function buildBlock(entries: string[]): string {
  if (entries.length === 0) return '';
  return [BLOCK_START, ...entries, BLOCK_END].join('\n') + '\n';
}

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
  const excludePath = useGitInfo
    ? join(gitRoot, '.git', 'info', 'exclude')
    : join(gitRoot, '.gitignore');

  if (useGitInfo) {
    await mkdir(join(gitRoot, '.git', 'info'), { recursive: true });
  }

  let existing = '';
  try {
    existing = await readFile(excludePath, 'utf-8');
  } catch {
    // File doesn't exist yet — start fresh
  }

  const entries = threads.map(t => targetDirForThread(t.filePath, gitRoot));
  const stripped = stripBlock(existing).trimEnd();
  const block = buildBlock(entries);
  const updated = stripped ? `${stripped}\n${block}` : block;

  await writeFile(excludePath, updated, 'utf-8');
}
