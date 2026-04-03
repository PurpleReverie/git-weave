import { readFile } from 'fs/promises';
import { join } from 'path';
import { WeaveConfig } from '../types.js';

const DEFAULTS: WeaveConfig = {
  version: 1,
  scan: ['.'],
  syncStrategy: 'pinned',
  hooks: {
    postMerge: true,
    postCheckout: true,
  },
  exclude: 'git-info',
};

export async function parseWeaveConfig(cwd: string): Promise<WeaveConfig> {
  const configPath = join(cwd, 'weave.json');

  let raw: string;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch {
    // No weave.json present — return defaults
    return { ...DEFAULTS };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in weave.json`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`weave.json must be a JSON object`);
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.scan !== undefined && (!Array.isArray(obj.scan) || obj.scan.some(s => typeof s !== 'string'))) {
    throw new Error(`weave.json: "scan" must be an array of strings`);
  }

  if (obj.syncStrategy !== undefined && obj.syncStrategy !== 'pinned' && obj.syncStrategy !== 'latest') {
    throw new Error(`weave.json: "syncStrategy" must be "pinned" or "latest"`);
  }

  if (obj.exclude !== undefined && obj.exclude !== 'git-info' && obj.exclude !== 'gitignore') {
    throw new Error(`weave.json: "exclude" must be "git-info" or "gitignore"`);
  }

  const hooks = typeof obj.hooks === 'object' && obj.hooks !== null
    ? obj.hooks as Record<string, unknown>
    : {};

  return {
    version: typeof obj.version === 'number' ? obj.version : DEFAULTS.version,
    scan: Array.isArray(obj.scan) ? obj.scan as string[] : DEFAULTS.scan,
    syncStrategy: (obj.syncStrategy as WeaveConfig['syncStrategy']) ?? DEFAULTS.syncStrategy,
    hooks: {
      postMerge: typeof hooks.postMerge === 'boolean' ? hooks.postMerge : DEFAULTS.hooks.postMerge,
      postCheckout: typeof hooks.postCheckout === 'boolean' ? hooks.postCheckout : DEFAULTS.hooks.postCheckout,
    },
    exclude: (obj.exclude as WeaveConfig['exclude']) ?? DEFAULTS.exclude,
  };
}
