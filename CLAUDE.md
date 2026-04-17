# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Weave** is a CLI tool for managing child git repositories within a parent repo using `.thread` descriptor files — a simpler alternative to git submodules. It handles cloning, syncing, locking to commit hashes, git hook integration, and SSH alias rewrites for multi-account setups.

## Commands

```bash
npm run build     # Compile TypeScript → dist/
npm run lint      # ESLint across src/ (typescript-eslint/recommended)
npm run dev       # Run via ts-node (no compile step, dev only)
make link         # Build + npm link globally (for local testing as `weave` CLI)
make unlink       # Remove global weave link
```

No test runner is configured yet.

To test manually, use the `.testbed/` directory — it has a `weave.json` and sample `.thread` files, and references the local package via `"file:.."`.

## Architecture

### Entry Point & CLI

`src/index.ts` — Commander.js app. Loads `.env` at startup (shell env always wins), then defines 8 commands: `init`, `sync`, `lock`, `unlock`, `check`, `ignore`, `hello`, `debug`. Each command delegates to a handler in `src/sync/` or `src/git/`.

### Config Layer (`src/config/`)

Two config files govern behaviour:
- **`weave.json`** — committed, shared: scan paths, sync strategy (`pinned` | `latest`), hook preferences, exclude method (`git-exclude` | `gitignore`)
- **`.env`** — gitignored, per-developer: SSH alias env vars

`parseWeaveConfig.ts` returns sane defaults if `weave.json` is absent. `parseThread.ts` validates `.thread` files (strict: `repo` + `branch` required, `hash` + `alias` optional). `scanThreadFiles.ts` walks scan paths and deduplicates results.

### `.thread` File Convention

A `.thread` file lives next to where its child repo should be cloned. `services/api.thread` → clones into `services/api/`. The `alias` field names an env var whose value overrides the `repo` URL (for SSH multi-account rewrites).

### Sync Layer (`src/sync/`)

`syncRepo.ts` is the core — it clones if missing, checks dirty state, fetches, then either checks out a pinned `hash` or pulls latest on `branch`. It then recurses into nested `.thread` files (up to 3 levels). `resolveAuth.ts` rewrites URLs via `alias` → env var before any git operation.

`lockThreads.ts` / `unlockThreads.ts` read/write the `hash` field in `.thread` files (equivalent to `package-lock.json` semantics).

`checkRepos.ts` verifies clean state; used by the `pre-push` hook to block pushes if child repos are dirty or unpushed.

### Git Layer (`src/git/`)

`updateExclude.ts` manages a weave-owned block in `.git/info/exclude` or `.gitignore` without touching surrounding content.

`installHooks.ts` appends weave commands to existing git hooks with `# managed by weave` markers for idempotency. Hooks installed: `post-merge` → `weave sync`, `post-checkout` → `weave sync`, `pre-push` → `weave check`.

### Key Types (`src/types.ts`)

- `ThreadFile` — raw parsed `.thread` JSON
- `WeaveConfig` — parsed `weave.json` with defaults applied
- `ResolvedThread` — `ThreadFile` with `alias` resolved to a concrete URL, ready for git operations

## ESM Module

The package is pure ESM (`"type": "module"` in package.json, `"module": "ES2022"` in tsconfig). All imports need extensions when working in `dist/`. `ts-node` is configured for ESM via `--esm` flag in the `dev` script.
