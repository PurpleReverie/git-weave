# Weave

A git-aware CLI for managing child repositories inside a parent repo. Declare dependencies via `.thread` files, and weave handles cloning, syncing, and keeping child directories out of your parent repo's version control.

## Installation

Install directly from GitHub (private):

```bash
npm install -g github:taurajgreig/dotnet-weave
```

Or reference in a project's `package.json`:

```json
{
  "dependencies": {
    "weave": "github:taurajgreig/dotnet-weave"
  }
}
```

Then run with:

```bash
npx weave sync
```

If your machine uses an SSH config alias instead of `github.com`, set up a git URL rewrite once — no changes to the install command needed:

```bash
git config url."git@your-alias:".insteadOf "git@github.com:"
```

## How it works

Place a `.thread` file anywhere in your repo next to where the child repo should live. Weave scans for them and clones/syncs the declared repos.

```
my-project/
├── weave.json
├── services/
│   ├── api.thread          ← declares the api repo
│   ├── api/                ← cloned here by weave sync
│   ├── worker.thread
│   └── worker/
```

## `.thread` file format

```json
{
  "repo": "git@github.com:org/repo.git",
  "branch": "main",
  "hash": "abc1234"
}
```

| Field | Required | Description |
|---|---|---|
| `repo` | Yes | Canonical remote URL — this is what gets committed |
| `branch` | Yes | Branch to track |
| `hash` | No | Pinned commit hash, tag, or short SHA. Omit to track latest on `branch` |
| `alias` | No | Env var name that, if set locally, overrides the `repo` URL for that machine |

## `weave.json` config

Optional. Place at the repo root to configure behaviour. If the file is absent, weave runs with all defaults — no config file is required to get started.

### Base config

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

### Options

| Field | Default | Values | Description |
|---|---|---|---|
| `version` | `1` | `1` | Config schema version |
| `scan` | `["."]` | Array of paths | Directories to search for `.thread` files, relative to repo root |
| `syncStrategy` | `"pinned"` | `"pinned"` \| `"latest"` | `"pinned"` respects `hash` field; `"latest"` always pulls branch HEAD |
| `hooks.postMerge` | `true` | `true` \| `false` | Install a `post-merge` hook — auto-syncs child repos on `git pull` |
| `hooks.postCheckout` | `true` | `true` \| `false` | Install a `post-checkout` hook — auto-syncs child repos on `git checkout` |
| `hooks.prePush` | `true` | `true` \| `false` | Install a `pre-push` hook — blocks push if any child repo is dirty or out of sync |
| `exclude` | `"git-info"` | `"git-info"` \| `"gitignore"` | Where to write child directory exclusions. `"git-info"` is silent and local; `"gitignore"` is committed |

## Commands

### `weave init`

Scan for `.thread` files, register child directories in `.git/info/exclude`, install git hooks, and sync all child repos.

```bash
weave init
```

Run this once when setting up a repo on a new machine.

### `weave sync`

Clone or update all child repos declared in `.thread` files.

```bash
weave sync
```

- Repos that don't exist locally are cloned
- Existing repos are fetched and checked out to the pinned hash or latest branch
- Skips repos with uncommitted changes or unpushed commits
- Recursively syncs nested `.thread` files found inside child repos (max 3 levels deep)
- Reports status per repo: `cloned`, `updated`, `skipped`, or `failed`

### `weave check`

Verify all child repos are clean and at the correct hash or branch HEAD. Exits with code `1` if any fail.

```bash
weave check
```

Used automatically by the `pre-push` hook to block pushes when child repos are out of sync.

### `weave lock`

Pin all child repos to their current HEAD hash — equivalent to committing a lockfile.

```bash
weave lock
```

### `weave unlock [path]`

Clear the pinned hash from a `.thread` file, returning it to latest-tracking mode. Omit `path` to unlock all.

```bash
weave unlock services/api.thread
weave unlock  # unlocks all
```

### `weave ignore`

Refresh `.git/info/exclude` entries — adds new child dirs, removes stale ones.

```bash
weave ignore
```

## Pinned vs latest

- **Pinned** (`hash` present) — reproducible across machines, like a lockfile
- **Latest** (`hash` absent) — always pulls branch HEAD

Use `weave lock` to snapshot current HEADs into all `.thread` files at any point.

## Modifying a child repo

When you need to make changes inside a child repo:

1. Edit and commit inside the child repo directory
2. Push to the child repo's remote
3. Update the `.thread` file with the new hash, or run `weave lock`
4. Commit the `.thread` change to the parent repo

`weave sync` will not overwrite a child repo that has uncommitted changes or unpushed commits — it skips and warns.

## Local machine setup

Two complementary mechanisms handle SSH alias differences between machines.

**Host-level rewrite** — good when all repos from a given host use the same SSH alias:

```bash
# Repo-local (writes to .git/config)
git config url."git@github-personal:".insteadOf "git@github.com:"

# Or globally
git config --global url."git@github-personal:".insteadOf "git@github.com:"
```

**Per-repo override via `alias`** — needed when different repos require different SSH aliases on the same machine. Set the `alias` field in the `.thread` file, then define the env var in a `.env` file at the repo root (or export it in your shell):

```json
{ "repo": "git@github.com:org/repo.git", "branch": "main", "alias": "MY_REPO" }
```

```bash
# .env  (gitignored)
MY_REPO=git@github-personal:org/repo.git
```

Weave loads `.env` automatically from wherever it is run. Shell environment variables take priority over `.env` values.
