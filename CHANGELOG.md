# Changelog

All notable changes to git-weave will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-06-01

### Added
- New `weave clean` command for removing cloned child directories whose
  `.thread` file no longer exists. Dry-run by default; `--apply` to remove
  clean orphans, `--force` to also remove dirty / unpushed / non-git ones.
- `--force` flag on `weave lock` to override the new unpushed-commit guard
  (see below).
- `tests/init-scenarios.sh` — end-to-end test script covering 17 scenarios
  with no test-framework dependency. Run with `./tests/init-scenarios.sh`.

### Changed
- **Recursive `.thread` discovery.** `scan` entries are now walked
  recursively. `.git`, `node_modules`, and nested git repositories are
  skipped. The README's documented `services/api.thread` layout now works
  with the default `scan: ["."]`.
- **First clones land on the requested branch.** `weave sync` / `weave init`
  pass `--branch thread.branch` so a freshly-cloned child starts on the
  requested branch rather than the remote's default `HEAD`.
- **`weave lock` refuses to pin unpushed commits.** The CLI verifies
  `HEAD` is reachable from a remote branch before writing the hash. Use
  `--force` to override.
- **`post-checkout` hook only fires on branch checkouts.** The installed
  hook now guards on git's `$3 = 1` flag so `git checkout <file>` no longer
  triggers a full `weave sync`.
- **`weave init` gives a useful message when no threads are found** — names
  the scan paths and suggests an example file.

### Fixed
- Empty placeholder child directories no longer cause sync to falsely
  report `uncommitted-changes`. Previously, simple-git would walk up to the
  *parent* repo's `.git` and report its state on the child. The fix detects
  the non-git directory, removes it if empty, or aborts cleanly without
  touching user data if it contains files.
- Cross-platform `targetDirForThread`: the previous implementation used
  `lastIndexOf('/')` which silently mangled Windows backslash paths.
  Consolidated into a single helper using `path.dirname`.

### Security
- Bumped `simple-git` to `^3.36.0` to clear
  [GHSA-hffm-xvc3-vprc](https://github.com/advisories/GHSA-hffm-xvc3-vprc)
  (high-severity RCE in `simple-git` < 3.36.0).

## [0.1.0] — initial public release

Initial public release of git-weave.
