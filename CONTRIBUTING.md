# Contributing

## Development Setup

1. Clone the repo
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Link globally for local testing: `make link` (runs build + `npm link`)

## Testing Manually

The `.testbed/` directory contains a `weave.json` and sample `.thread` files, and references the local package via `"file:.."`. Use it to test real behaviour without publishing:

```bash
cd .testbed
npx weave sync
```

## Submitting Changes

- For significant changes, **open an issue first** to discuss the approach before writing code.
- Keep PRs focused — one concern per PR.
- The codebase is TypeScript; run `npm run build` before submitting to confirm the compile is clean.
- There is no automated test suite yet — describe how you tested your change in the PR description.

## Code Style

Standard TypeScript conventions. The project uses ESM module syntax throughout (`"type": "module"`). All imports in `dist/` require explicit `.js` extensions.
