# UX Enhancements Plan

## Goal
Implement `docs/specs/260314-ux-enhancements/tasks.md` in order, updating progress after each completed task, while preserving existing code style and avoiding changes under `components/ui`.

## Phases
| Phase | Status | Notes |
|---|---|---|
| 1. Drag-and-drop attachments | complete | Added global chat-page drop zone, prompt suggestion utility, no duplicate drop handling |
| 2. Conversation full-text search | complete | Added async main-process search, IPC bridge, and grouped sidebar search results with debounce |
| 3. Error experience improvements | complete | Added retry status IPC, error metadata/actions, settings/retry buttons, and online status banner |
| 4. Long conversation virtualization | complete | Added `@tanstack/react-virtual`, internal auto-scroll behavior, and 200+ line code block collapsing |

## Constraints
- Do not modify files under `src/renderer/components/ui`
- Keep TypeScript strict mode and avoid explicit `any`
- New IPC channels require updates in handler, preload, and `src/renderer/electron.d.ts`
- Use Bun for dependency management and verification commands

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
