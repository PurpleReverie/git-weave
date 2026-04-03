# Weave — Specification

## Overview

`weave` is a git-aware CLI tool that manages child repositories inside a parent repo. Child repos are declared via `.thread` descriptor files scattered through the directory hierarchy. Weave hooks into git to automate syncing and keeps child repo directories out of the parent's version control.

---

## Language & Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **CLI framework:** `commander`
- **Git operations:** `simple-git`
- **Distribution:** npm global package (`npm install -g weave`)

---

## File Conventions

| File | Purpose |
|---|---|
| `.thread` | Child repo descriptor — lives next to where the child repo should be checked out |
| `weave.json` | Root config — project-wide defaults and settings |
| `weave.local.json` | Local overrides — gitignored, per-developer settings |

---

## `.thread` File Format

JSON file that declares a child repository dependency.

```json
{
  "repo": "git@github.com:org/repo.git",
  "branch": "main",
  "hash": "abc1234",
  "alias": "MY_REPO"
}
```

| Field | Required | Description |
|---|---|---|
| `repo` | Yes | Remote URL of the child repo |
| `branch` | Yes | Branch to track |
| `hash` | No | Pinned commit hash. If absent/null, pulls latest on `branch` |
| `alias` | No | Maps to an env var (e.g. `MY_REPO_TOKEN`) for private repo auth. No credentials stored in the file |

---

## `weave.json` — Root Config

Lives at the repo root. Holds project-wide defaults.

```json
{
  "version": 1,
  "scan": [".", "packages", "services"],
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
| `version` | `1` | Schema version for future compat |
| `scan` | `["."]` | Directories to search for `.thread` files |
| `syncStrategy` | `"pinned"` | Global default: `"pinned"` (use hash) or `"latest"` (use branch HEAD) |
| `hooks.postMerge` | `true` | Install a `post-merge` git hook to auto-trigger sync |
| `hooks.postCheckout` | `true` | Install a `post-checkout` git hook to auto-trigger sync |
| `exclude` | `"git-info"` | Where to write child dir exclusions: `"git-info"` (`.git/info/exclude`) or `"gitignore"` (`.gitignore`) |

---

## `weave.local.json` — Local Overrides

Gitignored. Per-developer settings that override the root config for local use.

```json
{
  "overrides": {
    "services/my-service": { "managed": false }
  }
}
```

Setting `"managed": false` on a child repo tells weave to skip it entirely during sync — useful when actively developing in a child repo over an extended period.

---

## Commands

### `weave init`
1. Walk the directory tree (respecting `scan` paths in `weave.json`) and find all `.thread` files
2. For each child repo: add the target directory to `.git/info/exclude`
3. Install git hooks (`post-merge`, `post-checkout`) based on `weave.json` hook settings
4. Attempt initial clone/checkout of each child repo

### `weave sync`
1. Re-scan for `.thread` files
2. For each child repo, check dirty state before touching it:
   - Skip + warn if: uncommitted changes, unpushed commits, or HEAD is ahead of pinned hash
3. If clean: `git fetch` + checkout pinned `hash` (or latest on `branch` if no hash)
4. Resolve auth via `alias` → env var mapping

### `weave lock`
Walks all `.thread` files, resolves the current HEAD of each child repo, and writes the hash in. Equivalent to `npm install` writing `package-lock.json`.

### `weave unlock [path]`
Clears the `hash` field in a `.thread` file, returning it to latest-tracking mode.

### `weave ignore`
Refreshes `.git/info/exclude` entries — adds or removes entries based on current `.thread` files. Useful if `.thread` files were added/removed after `init`.

---

## Sync Strategy: Pinned vs Latest

- **Pinned** (`hash` present): Checkout that exact commit. Reproducible across machines.
- **Latest** (`hash` absent/null): Pull latest on `branch`. Use `weave lock` to pin at any point.

This mirrors the package manager pattern of `dependencies` (latest) vs `package-lock.json` (pinned).

---

## Modifying a Child Repo

When you need to make changes to code inside a child repo:

1. Edit code in the child repo directory
2. Commit and push changes to the child repo's remote
3. Update the `.thread` file in the parent repo with the new hash (or run `weave lock`)
4. Commit the `.thread` change to the parent repo

The `.thread` file update is the canonical record that the parent now depends on the new version — same mental model as bumping a dependency version.

`weave sync` will not clobber a child repo that has uncommitted changes, unpushed commits, or a HEAD that is ahead of the pinned hash. It skips and warns instead.

---

## Git Exclude Strategy

Child repo directories are written to `.git/info/exclude` by default (not `.gitignore`). This keeps child dirs silently excluded from version control without polluting the committed `.gitignore`.
