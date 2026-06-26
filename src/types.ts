export interface ThreadFile {
  repo: string;
  branch: string;
  hash?: string | null;
  alias?: string;
}

export interface WeaveConfig {
  version: number;
  scan: string[];
  syncStrategy: 'pinned' | 'latest';
  // When true, a child repo checked out on a branch other than its .thread
  // `branch` is left alone: `weave check` won't flag it and `weave sync` won't
  // force it back onto the declared branch. Applies to latest-tracking repos
  // (no `hash`); pinned repos are still verified against their exact commit.
  ignoreBranchDivergence: boolean;
  // When true, uncommitted changes or unpushed commits in a child repo won't
  // cause `weave check` to fail — so the pre-push hook won't block a parent push
  // while you're mid-change in a child. Only takes effect when a child is
  // actually dirty (a clean checkout, e.g. in CI, is still fully verified).
  // `weave sync` still skips dirty repos regardless, to avoid clobbering work.
  allowDirty: boolean;
  hooks: {
    postMerge: boolean;
    postCheckout: boolean;
    prePush: boolean;
  };
  exclude: 'git-info' | 'gitignore';
}

export interface ResolvedThread {
  filePath: string;
  directory: string;
  thread: ThreadFile;
}