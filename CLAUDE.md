# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Dev mode (downloads binaries + builds skills + electron-vite dev)
bun run build        # Production build (electron-vite build)
bun run build:mac    # Build + package for macOS
bun run build:win    # Build + package for Windows
bun run typecheck    # TypeScript type checking (tsc --noEmit)
bun run lint         # ESLint (flat config, max-warnings=0)
bun run test         # Bun test runner
bun run format       # Prettier (with import sort + tailwind plugin)
bun run format:check # Prettier check only
```

## Architecture

Electron app with three processes communicating via IPC:

```
src/main/          → Electron main process (Node.js)
src/preload/       → Context bridge (exposes typed IPC to renderer)
src/renderer/      → React 19 + Tailwind CSS 4 UI
src/shared/        → Types shared across processes
```

### Agent Integration

The **only file coupled to Claude Agent SDK** is `src/main/lib/claude-session.ts`. It:
1. Calls `query()` from `@anthropic-ai/claude-agent-sdk` to start an agent session
2. Consumes the async iterable of SDK events (`stream_event`, `assistant`, `result`, `system`)
3. Translates them into IPC events sent to renderer

The renderer has **zero knowledge of the SDK** -- it only reacts to IPC events. To swap agent runtimes, only `claude-session.ts` needs a new implementation.

### IPC Protocol

All communication follows `namespace:action` naming. Key namespaces:

- **`chat:*`** -- Message sending, streaming chunks, tool use events, thinking blocks, session lifecycle
- **`config:*`** -- Workspace dir, API key, debug mode, PATH info, diagnostics
- **`conversation:*`** -- CRUD for persistent conversations (JSON files in userData)
- **`update:*`** -- Auto-update lifecycle
- **`shell:open-external`** -- Open URLs in system browser

Adding a new IPC channel requires changes in 3 places:
1. Handler in `src/main/handlers/` (register in `src/main/index.ts`)
2. Bridge in `src/preload/index.ts`
3. Type in `src/renderer/electron.d.ts`

### Message Streaming Flow

1. Renderer sends user text via `chat:send-message`
2. `chat-handlers.ts` validates API key, persists attachments to workspace, queues message
3. `claude-session.ts` feeds messages to SDK via async generator (`message-queue.ts`)
4. SDK streams events back; main process emits IPC events (`chat:message-chunk`, `chat:tool-use-start`, etc.)
5. `useClaudeChat` hook in renderer accumulates events into `Message[]` state
6. Chat page auto-saves conversation (debounced 2s) to `conversation-db.ts`

### Data Storage

- **Config**: `~/.config/Claude Agent Desktop/config.json` (API key, workspace dir, debug mode, model preference)
- **Conversations**: `~/.config/Claude Agent Desktop/conversations/{id}.json` (messages as JSON string)
- **Workspace**: `~/Desktop/claude-agent` (default, configurable) -- SDK cwd, attachments, .claude/ skills

### Skills System

Skills live in `.claude/skills/<name>/` with `SKILL.md` + TypeScript tools in `scripts/`. Built via `scripts/buildSkills.js` using `bun --compile`. On launch, bundled skills are synced to the workspace.

## Key Conventions

- **TypeScript strict mode** with no explicit `any`
- **Preload outputs CommonJS** (`out/preload/index.cjs`) -- required by Electron
- **Attachments**: max 32MB, persisted as `attachments/{timestamp}-{uuid}-{name}` in workspace
- **Models**: `claude-haiku-4-5-20251001` (fast), `claude-sonnet-4-5-20250929` (smart-sonnet), `claude-opus-4-5-20251101` (smart-opus) -- defined in `claude-session.ts`
- **Platform handling**: Windows bundles Git + MSYS2; PATH is constructed via `buildEnhancedPath()` in `config.ts`

## Workflow

After code changes, always run: `bun run lint && bun run typecheck && bun run test`

Commit messages follow Conventional Commits format.
