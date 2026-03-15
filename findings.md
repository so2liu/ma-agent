# Findings & Decisions

## Requirements
- Implement the tasks in `docs/specs/260314-multi-session/tasks.md` directly in code.
- Use `planning-with-files` and update `progress.md` after each completed task.
- Do not modify `src/renderer/components/ui/*`.
- Preserve TypeScript strictness and avoid explicit `any`.
- Use `bun` for validation commands.
- Breaking changes are allowed; forward compatibility is not required.

## Research Findings
- `requirements.md` defines independent concurrent conversations, per-conversation status visualization, new-chat behavior that must not interrupt running work, and no hard limit on concurrency.
- `design.md` centralizes the change around a renderer-generated `chatId` routed through renderer, IPC, and main process.
- Main process work touches `claude-session.ts`, `openai-session.ts`, `chat-handlers.ts`, `agent-runtime.ts`, and adds `session-manager.ts`.
- Renderer work requires a global store to preserve background-streamed events while inactive chats are not selected.
- `src/main/lib/claude-session.ts` currently stores all Anthropic runtime state in module globals and emits IPC without `chatId`.
- `src/main/lib/message-queue.ts` contains the single global queue, session ID, and abort flag that must become per-chat session state.
- `src/main/handlers/chat-handlers.ts` routes messages by global provider only, starts one shared Claude session, and exposes single-session `reset`/`stop` IPC handlers.
- `src/main/lib/openai-session.ts` is also single-instance and will need `chatId`-tagged emits even if full multi-instance support is deferred.
- `src/preload/index.ts` exposes chat event listeners with single-chat callback signatures and `stopMessage` / `resetSession` without `chatId`.
- `src/renderer/hooks/useClaudeChat.ts` owns all streamed message assembly locally, so inactive chats currently lose background events by design.
- `src/renderer/pages/Chat.tsx` keeps a single `currentSessionId`, calls `useClaudeChat()` without a key, and uses `isLoading` to guard chat switching/new-chat actions.
- `src/renderer/components/Sidebar.tsx` loads conversations independently and has no runtime status source today, so sidebar indicators will need a new renderer-side status lookup.
- `src/renderer/electron.d.ts` mirrors the preload single-chat signatures and will need shared payload types for `chatId`-annotated events.
- `Chat.tsx` currently persists `sessionId` from a single `onSessionUpdated` listener and writes it into conversations during debounced auto-save.
- `handleNewChat` and `handleLoadConversation` both call `window.electron.chat.resetSession(...)`, which would incorrectly tear down active background chats in the multi-session design.
- `handleSendMessage` sends payloads without a routing key and `handleStopStreaming` stops the global active response instead of a specific chat.
- `useClaudeChat.ts` also owns background task, retry, and debug accumulation logic, so the future store must preserve these per-chat sub-states, not just message arrays.
- `config.ts` already exposes `getAgentProvider()` and persists the global provider choice, so `SessionManager` can lock the provider at `chatId` creation time without adding new config machinery.
- `chat-handlers.ts` can route by `sessionManager.getOrCreate(chatId).provider`, which preserves provider locking even after the global provider setting changes.
- OpenAI support remains single-instance, but tagging every emitted payload with `chatId` plus tracking `activeChatId` is enough for the v1 scope defined in `tasks.md`.
- Both `Sidebar.tsx` and `ChatHistoryDrawer.tsx` call `window.electron.conversation.delete(...)` directly, so renderer-side chat state/session cleanup must be wired into both deletion flows or abstracted into shared helpers.
- `Settings.tsx` previously reset the global chat session when switching providers, but in the multi-session model provider changes should only affect future chats because existing chats are provider-locked.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Follow the task order from `tasks.md` unless blocked by dependency discovery | Matches the user's instruction to implement step by step |
| Treat the design doc as authoritative for API shapes such as `chatId` payload injection | Reduces drift while refactoring across processes |
| Model each Anthropic chat as a `ManagedSession` with queue helpers and a bound async generator | Keeps the former `message-queue.ts` semantics intact while making state per-chat instead of global |

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- `docs/specs/260314-multi-session/requirements.md`
- `docs/specs/260314-multi-session/design.md`
- `docs/specs/260314-multi-session/tasks.md`
- `/Users/yangliu35/.agents/skills/planning-with-files/SKILL.md`

## Visual/Browser Findings
- None.
