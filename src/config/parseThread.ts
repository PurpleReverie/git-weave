import { readFile } from 'fs/promises';
import { ThreadFile } from '../types.js';

export async function parseThread(filePath: string): Promise<ThreadFile> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    throw new Error(`Cannot read .thread file: ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in .thread file: ${filePath}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object in .thread file: ${filePath}`);
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.repo !== 'string' || obj.repo.trim() === '') {
    throw new Error(`Missing or empty required field "repo" in: ${filePath}`);
  }

  if (typeof obj.branch !== 'string' || obj.branch.trim() === '') {
    throw new Error(`Missing or empty required field "branch" in: ${filePath}`);
  }

  if (obj.hash !== undefined && obj.hash !== null && typeof obj.hash !== 'string') {
    throw new Error(`Field "hash" must be a string or null in: ${filePath}`);
  }

  if (obj.alias !== undefined && typeof obj.alias !== 'string') {
    throw new Error(`Field "alias" must be a string in: ${filePath}`);
  }

  return {
    repo: obj.repo,
    branch: obj.branch,
    hash: obj.hash as string | null | undefined,
    alias: obj.alias as string | undefined,
  };
}
