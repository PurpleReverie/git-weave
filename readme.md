# git-weave

**Manage child git repositories inside a parent repo — without git submodules.**

[![npm version](https://img.shields.io/npm/v/git-weave.svg)](https://www.npmjs.com/package/git-weave)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/PurpleReverie/git-weave/actions/workflows/ci.yml/badge.svg)](https://github.com/PurpleReverie/git-weave/actions/workflows/ci.yml)

git-weave uses lightweight `.thread` descriptor files to declare which repos belong where. One command clones them all, keeps them in sync, and keeps your parent repo's working tree clean.

---

## Why git-weave?

Git submodules work, but they're notoriously awkward: accidental detached HEADs, manual `--recurse-submodules` on every clone, and `.gitmodules` that break when SSH aliases differ between machines.

git-weave takes a different approach:

- `.thread` files declare repos the same way `package.json` declares dependencies
- `weave sync` handles clone-if-missing and update-to-correct-ref in one command
- Child directories are kept out of the parent repo's index automatically
- Pinned hashes give lockfile-style reproducibility; latest-tracking mode is one field away
- Per-developer SSH alias overrides via environment variables — no shared config to update

---

## Installation

Install as a dev dependency (recommended):

```bash
npm install --save-dev git-weave
```

Then run via npx:

```bash
npx weave init
npx weave sync
```

Or add aliases in your `package.json` scripts — npm scripts include `node_modules/.bin` in PATH automatically, so you can use the bare command:

```json
{
  "scripts": {
    "weave:init": "weave init",
    "weave:sync": "weave sync"
  }
}
```

**Global install** (for personal use across multiple repos):

```bash
npm install -g git-weave
weave init
```

---

## Quick Start

**1. Create a `.thread` file** next to where the child repo should be cloned:

```
my-project/
├── weave.json          ← optional config
└── services/
    └── api.thread      ← declares the api repo
```

```json
{
  "repo": "git@github.com:org/api.git",
  "branch": "main"
}
```

**2. Initialise** (first time on a new machine):

```bash
npx weave init
```

This installs git hooks, registers child directories in `.git/info/exclude`, and clones everything.

**3. Keep in sync** at any time:

```bash
npx weave sync
```

That's it. `services/api/` is cloned and checked out, and your parent repo's `git status` stays clean.

---

## How It Works

Place a `.thread` file anywhere in your repo alongside where the child repo should live. The filename determines the clone destination: `services/api.thread` → clones into `services/api/`.

```
my-project/
├── weave.json
├── services/
│   ├── api.thread          ← declares the api repo
│   ├── api/                ← cloned by weave sync
│   ├── worker.thread
│   └── worker/
└── packages/
    ├── ui.thread
    └── ui/
```

`.thread` files are committed to the parent repo. Cloned directories are excluded from the parent repo's index automatically (via `.git/info/exclude` by default, so nothing lands in `.gitignore`).

---

## `.thread` File Format

```json
{
  "repo": "git@github.com:org/repo.git",
  "branch": "main",
  "hash": "a3f9c12",
  "alias": "MY_REPO_URL"
}
```

| Field | Required | Description |
|---|---|---|
| `repo` | Yes | Canonical remote URL — committed to the parent repo |
| `branch` | Yes | Branch to track |
| `hash` | No | Pinned commit hash, tag, or abbreviated SHA. When present, weave checks out this exact ref instead of pulling latest |
| `alias` | No | Name of an environment variable whose value overrides `repo` at sync time — for per-machine SSH alias rewrites |

---

## Commands

### `weave init`

Run once when setting up a repo on a new machine. Scans for `.thread` files, installs git hooks, registers exclusions, and syncs all child repos.

```bash
npx weave init
```

### `weave sync`

Clone or update all child repos declared in `.thread` files.

```bash
npx weave sync
```

- Repos that don't exist locally are cloned
- Existing repos are fetched then checked out to the pinned hash or latest branch
- Repos with uncommitted changes or commits not yet pushed are skipped with a warning
- Recursively follows `.thread` files found inside child repos (up to 3 levels deep)
- Reports per-repo status: `cloned`, `updated`, `skipped`, or `failed`

### `weave lock`

Pin every child repo to its current HEAD commit — equivalent to committing a lockfile snapshot.

```bash
npx weave lock
```

Writes the resolved full SHA into each `.thread` file. Commit the changes to the parent repo to share the lock with your team.

### `weave unlock [path]`

Remove the pinned hash from a `.thread` file, returning it to latest-tracking mode.

```bash
npx weave unlock services/api.thread   # unlock one
npx weave unlock                       # unlock all
```

### `weave check`

Verify all child repos are clean and at the expected hash or branch HEAD. Exits with code `1` if any repo fails the check.

```bash
npx weave check
```

Runs automatically as a `pre-push` hook to block pushes when child repos are out of sync.

### `weave ignore`

Refresh the exclusion entries for child directories — adds new ones, removes stale ones.

```bash
npx weave ignore
```

Useful if you add new `.thread` files and want to update exclusions without a full sync.

---

## Configuration

`weave.json` at the repo root is optional. git-weave runs with sensible defaults if it's absent.

```json
{
  "version": 1,
  "scan": ["."],
  "syncStrategy": "pinned",
  "hooks": {
    "postMerge": true,
    "postCheckout": true,
    "prePush": true
  },
  "exclude": "git-info"
}
```

| Field | Default | Description |
|---|---|---|
| `version` | `1` | Config schema version |
| `scan` | `["."]` | Directories to scan for `.thread` files, relative to repo root |
| `syncStrategy` | `"pinned"` | `"pinned"` — respect the `hash` field; `"latest"` — always pull branch HEAD regardless of `hash` |
| `hooks.postMerge` | `true` | Install a `post-merge` hook that auto-runs `weave sync` after `git pull` |
| `hooks.postCheckout` | `true` | Install a `post-checkout` hook that auto-runs `weave sync` after `git checkout` |
| `hooks.prePush` | `true` | Install a `pre-push` hook that blocks pushes if any child repo is dirty or out of sync |
| `exclude` | `"git-info"` | `"git-info"` writes exclusions to `.git/info/exclude` (local-only, not committed); `"gitignore"` writes to `.gitignore` |

Hooks are installed safely — running `weave init` multiple times will not create duplicates.

---

## Pinned vs Latest

**Pinned** (`hash` field present): weave checks out that exact commit on every sync. Reproducible across all machines, like a lockfile. Use `weave lock` to snapshot and `weave unlock` to release.

**Latest** (`hash` field absent): weave checks out the branch and pulls on every sync. Always reflects the latest remote state.

You can mix strategies within the same repo — pin the repos that need stability, leave others on latest.

---

## Working Inside a Child Repo

git-weave skips repos with uncommitted changes or commits not yet pushed to avoid overwriting in-progress work. The typical workflow for making changes:

1. Edit and commit inside the child repo directory as normal
2. Push to the child repo's remote
3. Run `npx weave lock` in the parent repo (or manually update `hash` in the `.thread` file)
4. Commit the updated `.thread` file to the parent repo

---

## Multi-Account SSH Setup

When different repos require different SSH identities on the same machine, use the `alias` field in the `.thread` file combined with a `.env` file at the parent repo root.

```json
{
  "repo": "git@github.com:org/repo.git",
  "branch": "main",
  "alias": "ORG_REPO_URL"
}
```

```bash
# .env  (gitignored — each developer sets their own)
ORG_REPO_URL=git@github-work:org/repo.git
```

git-weave loads `.env` automatically and substitutes the env var value in place of `repo` before any git operation. Shell environment variables take priority over `.env` values, so CI can inject overrides without a file.

**Alternative — host-level URL rewrite** (simpler when all repos from a host share the same alias):

```bash
git config url."git@github-work:".insteadOf "git@github.com:"
```

This is handled by git itself and requires no `.thread` changes.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

[MIT](LICENSE)
