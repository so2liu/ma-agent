# Findings

## 2026-03-14
- `ChatInput.tsx` already implements local drag-and-drop handling, so chat-page global drop logic must skip events when `event.defaultPrevented` is already set.
- Current target files for the spec exist under main/preload/renderer exactly as described in the design doc.
- `Chat.tsx` currently owns `inputValue`, `pendingAttachments`, and `handleFilesSelected`, which makes it the correct place to add global drag listeners and prompt prefill behavior.
- `Chat.tsx` still depends on `useAutoScroll`; that hook should remain untouched for task 1 and only be removed during task 4.
- `Sidebar.tsx` currently filters only the already-loaded `ConversationSummary[]`, so old conversations outside the default list limit would be invisible to search unless search moves into the main process.
- `conversation-db.ts` already has `extractTextFromContent()` and preview helpers; search should reuse that extraction logic but switch to `fs/promises` to avoid blocking Electron main.
- `App.tsx` owns the actual view navigation state, so the error-message “前往设置” action must be passed down as a callback instead of trying to navigate directly from the message component.
- `Chat.tsx` is the right place to implement manual retry because it already prepares serialized attachments before calling `window.electron.chat.sendMessage`, which allows safe reuse after a failed send.
