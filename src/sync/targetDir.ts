import { basename, dirname, join } from 'path';

// The destination directory for a thread, derived from the .thread file path.
// `services/api.thread` → `services/api`. Uses path.dirname so it stays correct
// on Windows where separators are backslashes.
export function targetDirForThread(filePath: string): string {
  return join(dirname(filePath), basename(filePath, '.thread'));
}
