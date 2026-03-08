# Bundle Size Reduction Plan

## Current State

Measured locally on 2026-03-08 after removing bundled `uv`:

- `resources/bun`: about `57M`
- `out/node_modules`: about `144M`
- `out/node_modules/@anthropic-ai/claude-agent-sdk`: about `21M`
- `out/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep`: about `10M`
- `out/node_modules/@img/sharp-libvips-darwin-arm64`: about `15M`
- `out/node_modules/better-sqlite3`: about `12M`
- `out/node_modules/lucide-react`: about `44M`
- `out/node_modules/react-dom`: about `7.1M`
- `out/node_modules/shiki`: about `3.8M`

## Highest ROI

- Restrict `out/node_modules` to main-process runtime dependencies only.
  Right now the release bundle still copies many renderer-only packages into `out/node_modules`, including `lucide-react`, `react-dom`, `react-markdown`, and `shiki`. These should stay inside the renderer build output, not the packaged runtime dependency tree.

- Replace the current "copy every package.json dependency recursively" strategy in [scripts/beforeBuild.js](/Users/yangliu35/playground/ma-agent/scripts/beforeBuild.js).
  Prefer a small allowlist for main-process dependencies used by `src/main/` and `src/preload/`, then recursively resolve only what those packages need at runtime.

- Re-measure after that change before doing further pruning.
  This is the most likely place to recover another `50M+` without changing product behavior.

## Medium ROI

- Keep pruning `@anthropic-ai/claude-agent-sdk` vendor assets.
  We already removed the JetBrains plugin and non-current-platform `ripgrep` binaries. The remaining vendor payload is still large enough to justify a second pass.

- Audit whether all of `vendor/ripgrep` is actually needed at runtime.
  If the desktop app only needs a subset of the SDK sidecars on macOS, trim further. Do not guess; verify against actual SDK behavior.

- Consider whether bundled `bun` is still worth the size.
  `bun` is currently a real runtime dependency and removing it would change product behavior. If the product is willing to require user-installed `bun`, this is the single largest easy cut in `resources`.

## Lower ROI / Higher Risk

- Evaluate removing `sharp` only if image-processing degradation is acceptable.
  The `@img/sharp-*` packages and bundled `libvips` take meaningful space, but they likely support Claude SDK image handling. Treat this as a product decision, not a blind optimization.

- Evaluate replacing `better-sqlite3` only if there is another reason to touch storage.
  It is not tiny, but changing it is much more expensive than fixing dependency copying.

## Hygiene Pass

- Exclude tests, examples, source maps, and docs from copied runtime dependencies where safe.
- Verify `electron-builder` `files` and `asarUnpack` rules are not wider than necessary.
- Re-check packaged app contents after every change instead of stacking multiple unmeasured optimizations.

## Suggested Execution Order

1. Rework [scripts/beforeBuild.js](/Users/yangliu35/playground/ma-agent/scripts/beforeBuild.js) to copy only main-process runtime dependencies.
2. Rebuild and measure `out/node_modules` again.
3. Do a second SDK vendor pruning pass.
4. Decide whether keeping bundled `bun` is still a product requirement.
5. Only then consider `sharp` or storage-layer changes.
