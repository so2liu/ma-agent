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

### Build-time Environment Variables

通过 `electron.vite.config.ts` 的 `define` 注入到 main process，编译时替换：

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `PARSE_SERVER_URL` | 智能配置 NLP 解析服务地址 | `https://ma-agent.yangl.com.cn` |
| `HMAC_SECRET` | 解析服务 HMAC 签名密钥 | `ma-agent-parse-v1-default` |

运行时环境变量 `PARSE_SERVER_URL` 可覆盖编译时默认值（方便本地开发）。

运行时环境变量（main process 直接读取 `process.env`）：

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `POSTHOG_API_KEY` | PostHog analytics key | 硬编码默认值 |
| `POSTHOG_HOST` | PostHog host | `https://eu.i.posthog.com` |

## Key Conventions

- **TypeScript strict mode** with no explicit `any`
- **Preload outputs CommonJS** (`out/preload/index.cjs`) -- required by Electron
- **Attachments**: max 32MB, persisted as `attachments/{timestamp}-{uuid}-{name}` in workspace
- **Models**: `claude-haiku-4-5-20251001` (fast), `claude-sonnet-4-5-20250929` (smart-sonnet), `claude-opus-4-5-20251101` (smart-opus) -- defined in `claude-session.ts`
- **Platform handling**: Windows bundles Git + MSYS2; PATH is constructed via `buildEnhancedPath()` in `config.ts`

## Workflow

After code changes, always run: `bun run lint && bun run typecheck && bun run test`

Commit messages follow Conventional Commits format.

## Design Context

### Users

非技术知识工作者（文档处理、数据分析、表格处理、自动化），在日常工作中使用 AI 助手提高效率。他们不懂编程，需要直觉化的操作体验。

### Brand Personality

简洁、智能、亲切。品牌名"小马快跑"传达轻快、友好的形象。

### Aesthetic Direction

- **视觉基调**: Notion 风格 — 简洁但功能丰富，留白充分，信息层次清晰
- **参考**: Notion（简洁布局、优雅排版）、Apple 原生应用（毛玻璃、圆角）
- **反参考**: 不要像传统 IDE 或终端工具那样技术感过重
- **主题**: 明暗双模式，跟随系统偏好
- **色彩**: 中性色为主（neutral 色阶），搭配渐变色点缀技能卡片

### Design Principles

1. **零认知负担** — 界面自解释，用户不需要思考下一步该做什么
2. **内容优先** — UI 退居幕后，让对话内容和结果成为焦点
3. **渐进展示** — 复杂功能逐层呈现，不一次性暴露所有选项
4. **亲切而非幼稚** — 友好的语气和视觉，但保持专业感和可信度
5. **原生体感** — 尽可能贴近 macOS 原生应用的交互和视觉体验
