# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What This Is

**Weave** is a CLI tool for managing child git repositories within a parent repo using `.thread` descriptor files — a simpler alternative to git submodules. It handles cloning, syncing, locking to commit hashes, git hook integration, and SSH alias rewrites for multi-account setups.

For the user-facing feature set and command list, see `README.md` and `src/index.ts` (the Commander definitions are the source of truth).

## Working in this repo

- Build/dev/link scripts: see `package.json` and `Makefile`. Don't restate them here — they'll drift.
- No test runner is wired up. If you add one, update this section.

## Architecture

### `.thread` file convention

A `.thread` file lives next to where its child repo should be cloned. `services/api.thread` → clones into `services/api/`. The `alias` field, when set, names an environment variable whose value overrides the `repo` URL — used for SSH multi-account host rewrites.

### Configuration

- **`weave.json`** — committed, shared across the team. Defines scan paths, sync strategy, hook preferences, and exclude method. The schema lives in `src/types.ts`; the parser in `src/config/parseWeaveConfig.ts` applies defaults when fields or the file are absent.
- **`.env`** — gitignored, per-developer. Holds the values for any env vars referenced by `.thread` `alias` fields.

`.env` is loaded once at CLI startup; shell environment takes precedence.

### Source layout

- `src/index.ts` — Commander entry point. Each subcommand is a thin wrapper that delegates to a handler.
- `src/config/` — parses `weave.json` and `.thread` files, scans for `.thread` files.
- `src/sync/` — clone/fetch/checkout logic, lock/unlock of pinned hashes, clean-state checks, and alias → URL resolution.
- `src/git/` — git-repo discovery, dirty-state checks, `.git/info/exclude` / `.gitignore` management, and git-hook installation.
- `src/types.ts` — shared type definitions for parsed config and resolved threads.

### Git integration

Weave manages a marked block in either `.git/info/exclude` or `.gitignore` (configurable) so that child repo directories don't show up as untracked in the parent. Git hooks are installed with `# managed by weave` markers and appended to existing hook contents idempotently.

## ESM

The package is pure ESM (`"type": "module"`). Relative imports in `src/` must include the `.js` extension so they resolve in compiled output. `ts-node` runs in ESM mode for development.
