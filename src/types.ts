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