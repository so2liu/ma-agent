# Task Plan: Multi-Session Parallel Chat

## Goal
Implement the multi-session parallel chat architecture from `docs/specs/260314-multi-session/tasks.md`, including per-chat session routing across main/preload/renderer, sidebar status indicators, session cleanup, and passing lint/typecheck/test.

## Current Phase
Phase 5

## Phases
### Phase 1: Requirements & Discovery
- [x] Read `requirements.md`
- [x] Read `design.md`
- [x] Read `tasks.md`
- [x] Identify constraints and touched areas
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Create planning files
- [x] Map tasks to code areas
- [x] Finalize implementation order and interfaces
- **Status:** complete

### Phase 3: Main Process Refactor
- [x] Implement `session-manager.ts`
- [x] Refactor `claude-session.ts`
- [x] Remove `message-queue.ts`
- [x] Update `chat-handlers.ts`
- [x] Update `openai-session.ts`
- [x] Update `agent-runtime.ts`
- **Status:** complete

### Phase 4: IPC & Renderer Refactor
- [x] Update shared IPC types
- [x] Update preload bridge
- [x] Update renderer Electron typings
- [x] Implement global `chatStore`
- [x] Refactor `useClaudeChat`
- [x] Update `Chat.tsx`
- [x] Add sidebar status indicators
- [x] Integrate session destroy flow
- **Status:** complete

### Phase 5: Verification
- [x] Run `bun run lint`
- [x] Run `bun run typecheck`
- [x] Run `bun run test`
- [x] Fix remaining issues
- **Status:** complete

## Key Questions
1. How much of the current main-process session state can be moved into a reusable per-chat session object without changing provider abstractions?
2. Which renderer behaviors currently assume a single global session and must be converted to `chatId`-scoped state?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use `chatId` as the session routing key end-to-end | Matches the design and covers unsaved conversations from the first message onward |
| Keep progress tracking in root markdown files | Required by the `planning-with-files` skill and the user request |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|

## Notes
- Do not modify `src/renderer/components/ui/*`.
- Use `apply_patch` for all manual file edits.
- Update `progress.md` after every completed task from `tasks.md`.
