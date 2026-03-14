# Progress Log

## 2026-03-14
- Initialized planning files from `docs/specs/260314-ux-enhancements/*`.
- Completed Task 1 `拖拽文件到输入框 (#63)`: added global drag overlay, prompt suggestion utility, and duplicate-drop guard in `Chat.tsx`.
- Completed Task 2 `全文搜索历史对话 (#64)`: added async conversation search IPC and grouped sidebar search results with 300ms debounce and keyword highlighting.
- Completed Task 3 `错误体验优化 (#72)`: added retry-status IPC, retry/settings/copy actions on error messages, and online status banner support.
- Completed Task 4 `长对话虚拟滚动 (#71)`: added `@tanstack/react-virtual` message virtualization and 200+ line code block collapsing in markdown rendering.
- Verification:
  - `bun run lint`
  - `bun run typecheck`
  - `bun run test`
