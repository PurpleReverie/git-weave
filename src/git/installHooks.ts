import { readFile, writeFile, chmod, mkdir } from 'fs/promises';
import { join } from 'path';
import { WeaveConfig } from '../types.js';

const WEAVE_MARKER = '# managed by weave';

const HOOK_LINE: Record<string, string> = {
  'post-merge': `weave sync  ${WEAVE_MARKER}`,
  'post-checkout': `weave sync  ${WEAVE_MARKER}`,
  'pre-push': `weave check  ${WEAVE_MARKER}`,
};

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function installHook(hooksDir: string, hookName: string): Promise<void> {
  const hookPath = join(hooksDir, hookName);
  const line = HOOK_LINE[hookName];
  const existing = await readFileOrNull(hookPath);

  if (existing === null) {
    const content = `#!/bin/sh\n${line}\n`;
    await writeFile(hookPath, content, 'utf8');
  } else {
    if (existing.includes(WEAVE_MARKER)) {
      return; // already installed
    }
    const separator = existing.endsWith('\n') ? '' : '\n';
    await writeFile(hookPath, `${existing}${separator}${line}\n`, 'utf8');
  }

  await chmod(hookPath, 0o755);
}

export async function installHooks(gitRoot: string, config: WeaveConfig): Promise<void> {
  const hooksDir = join(gitRoot, '.git', 'hooks');
  await mkdir(hooksDir, { recursive: true });

  if (config.hooks.postMerge) {
    await installHook(hooksDir, 'post-merge');
  }

  if (config.hooks.postCheckout) {
    await installHook(hooksDir, 'post-checkout');
  }

  if (config.hooks.prePush) {
    await installHook(hooksDir, 'pre-push');
  }
}
