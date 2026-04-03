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
| `repo` | Yes | Canonical remote URL |
| `branch` | Yes | Branch to track |
| `hash` | No | Pinned commit hash. Omit to track latest on `branch` |

## `weave.json` config

Optional. Place at the repo root to configure behaviour. All fields have defaults.

```json
{
  "version": 1,
  "scan": ["services", "packages"],
  "syncStrategy": "pinned",
  "hooks": {
    "postMerge": true,
    "postCheckout": true
  },
  "exclude": "git-info"
}
```

| Field | Default | Description |
|---|---|---|
| `scan` | `["."]` | Directories to search for `.thread` files |
| `syncStrategy` | `"pinned"` | `"pinned"` uses `hash`, `"latest"` always pulls branch HEAD |
| `hooks.postMerge` | `true` | Auto-sync on `git pull` |
| `hooks.postCheckout` | `true` | Auto-sync on `git checkout` |
| `exclude` | `"git-info"` | Write child dirs to `.git/info/exclude` (silent, local) or `.gitignore` (committed) |

## Commands

### `weave sync`

Clone or update all child repos declared in `.thread` files.

```bash
weave sync
```

- Repos that don't exist locally are cloned
- Existing repos are fetched and checked out to the pinned hash or latest branch
- Reports status per repo: `cloned`, `updated`, or `failed`

### `weave init` _(coming in M3)_

Scan for `.thread` files, register child directories in `.git/info/exclude`, and install git hooks so sync runs automatically on pull and checkout.

### `weave lock` _(coming in M4)_

Pin all child repos to their current HEAD hash — equivalent to committing a lockfile.

```bash
weave lock
```

### `weave unlock [path]` _(coming in M4)_

Clear the pinned hash from a `.thread` file, returning it to latest-tracking mode.

### `weave ignore` _(coming in M3)_

Refresh `.git/info/exclude` entries — adds new child dirs, removes stale ones.

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

If you need to override a repo URL locally (e.g. SSH config alias), use git's URL rewrite — no changes to `.thread` files needed:

```bash
# Repo-local (writes to .git/config)
git config url."git@github-personal:".insteadOf "git@github.com:"

# Or globally on the machine
git config --global url."git@github-personal:".insteadOf "git@github.com:"
```
