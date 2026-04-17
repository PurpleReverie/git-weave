# Roadmap

git-weave is a working CLI tool. This document tracks planned improvements and future directions.

---

## Near-term (v0.2)

- **`weave.local.json` support** — per-developer managed overrides. A `"managed": false` flag lets individuals opt specific repos out of sync without modifying committed `.thread` files.
- **Node ≥18 enforcement at startup** — currently assumed but not validated at runtime.
- **Wrong-remote warning** — warn and skip when a local directory already exists pointing to a different remote than the `.thread` file declares.

---

## Medium-term (v0.x)

- **`weave add <repo-url>`** — interactive scaffold that creates a `.thread` file from a repo URL, prompts for branch and alias, and runs sync.
- **`weave status`** — at-a-glance dashboard showing all child repos with their branch, dirty state, and hash vs HEAD comparison. No mutation.
- **`weave sync --ci` mode** — fail fast, no dirty-state skipping, structured output. Designed for use in CI pipelines where silent skipping is a bug.

---

## Long-term

- **Guided SSH alias setup** — `weave init` detects when a repo URL doesn't match any known SSH host and walks the user through creating the `alias` + `.env` entry.
- **Shell completions** — bash, zsh, and fish completions for all commands and common options.
- **Plugin system** — custom sync strategies as npm packages, loaded via `weave.json` config.

---

## Known Limitations (not blocking v0.1 release)

1. **Wrong-remote child directory** — if a local directory exists pointing to a different remote than the `.thread` file, `weave sync` proceeds without warning.
2. **No concurrent sync protection** — two simultaneous `weave sync` calls can conflict. No file locking is in place.
3. **`.thread` → directory collision** — two `.thread` files resolving to the same local path are not detected.
4. **Recursive loop** — a child repo with a `.thread` file pointing back to the parent hits the 3-level depth cap with no specific warning.
5. **`weave.local.json` not wired** — the spec defines per-developer overrides but the CLI does not yet read `weave.local.json`.
