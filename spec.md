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

## Package Distribution

### Installing from a GitHub repo (private use)

npm supports installing directly from a GitHub repository without publishing to any registry:

```bash
npm install -g github:taurajgreig/dotnet-weave
```

Or pinned to a tag or commit:

```bash
npm install -g github:taurajgreig/dotnet-weave#v0.1.0
```

Referenced in another project's `package.json`:

```json
{
  "dependencies": {
    "weave": "github:taurajgreig/dotnet-weave"
  }
}
```

Access to private repos is handled via existing SSH or GitHub auth on the machine — no extra config needed.

### SSH alias rewriting (awareness only — not yet implemented)

If a machine uses an SSH config alias instead of `github.com` directly (e.g. for multi-account setups), git can transparently rewrite URLs without changing `package.json`:

```bash
# Apply only to this repo (writes to .git/config)
git config url."git@mygithub:".insteadOf "git@github.com:"

# Or globally on the machine
git config --global url."git@mygithub:".insteadOf "git@github.com:"
```

`package.json` always holds the canonical `github:taurajgreig/...` address. The rewrite rule lives on the machine, not in the repo. This is not automated yet — it is a manual step when setting up on a new machine with a non-standard SSH config.

---

## Package Folder Structure

The minimum structure required for the repo to function as an installable npm package:

```
weave/
├── src/
│   └── index.ts        # Entry point — must have #!/usr/bin/env node shebang
├── dist/               # Compiled output — gitignored, built automatically on install via prepare script
│   └── index.js
├── package.json        # See required fields below
├── tsconfig.json
└── .gitignore
```

### Required `package.json` fields

| Field | Value | Purpose |
|---|---|---|
| `"name"` | `"weave"` | Package identity |
| `"version"` | `"0.1.0"` | Version |
| `"main"` | `"dist/index.js"` | Entry point for require/import |
| `"bin"` | `{ "weave": "dist/index.js" }` | Registers the `weave` CLI command on install |
| `"type"` | `"module"` | ESM module mode |
| `"prepare"` | `"npm run build"` | Runs `tsc` automatically when installed from a git URL — ensures `dist/` is built on the consuming machine |
| `"files"` | `["dist"]` | Controls what is included when publishing to a registry (less critical for git installs) |

### Shebang requirement

The compiled `dist/index.js` must begin with:

```
#!/usr/bin/env node
```

This is set in `src/index.ts` and carried through by the TypeScript compiler. Without it, the installed binary won't be executable directly as a CLI command.

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
  "hash": "abc1234"
}
```

| Field | Required | Description |
|---|---|---|
| `repo` | Yes | Canonical remote URL of the child repo — this is what gets committed |
| `branch` | Yes | Branch to track |
| `hash` | No | Pinned commit hash. If absent/null, pulls latest on `branch` |

### Local URL overriding (SSH aliases)

If a machine uses an SSH config alias instead of the canonical host in `repo` (e.g. `github-personal` instead of `github.com`), use git's built-in URL rewrite rather than modifying the `.thread` file:

```bash
git config url."git@github-personal:".insteadOf "git@github.com:"
```

This keeps `.thread` files portable and committed as-is. The rewrite lives in `.git/config` (repo-local) or `~/.gitconfig` (global). See the Package Distribution section for more detail.

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
