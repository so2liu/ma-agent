# 实施计划

- [ ] 1. 新建 `src/main/lib/session-manager.ts`
  - 定义 `ManagedSession` 接口（包含 chatId、provider、session 状态、message queue、stream 状态、rate limit 等）
  - 实现 `SessionManager` 类：`getOrCreate(chatId)`、`destroy(chatId)`、`get(chatId)`、`has(chatId)`、`isAnyChatActive()`、`listActive()`
  - 每个 session 有独立的 messageQueue、sessionId、generation counter
  - 每个 session 有独立的 `messageGenerator()` async generator
  - provider 字段在创建时锁定
  - _需求：需求 1_

- [ ] 2. 重构 `src/main/lib/claude-session.ts` 使用 SessionManager
  - 移除所有模块级全局状态变量（querySession、isProcessing、shouldAbortSession 等）
  - `startStreamingSession(mainWindow, chatId)` — 从 SessionManager 获取对应 session 状态
  - `resetSession(chatId, resumeSessionId?)` — 操作特定 chatId 的 session
  - `interruptCurrentResponse(mainWindow, chatId)` — 中断特定 chatId
  - `isSessionActive(chatId?)` — 无参数时检查任意活跃 session
  - 所有 `mainWindow.webContents.send()` 调用增加 `chatId` 到 payload
  - _需求：需求 1, 需求 3_

- [ ] 3. 删除 `src/main/lib/message-queue.ts`
  - 功能已合并到 session-manager.ts 的 per-chat 状态中
  - 更新所有 import 引用
  - _需求：需求 1_

- [ ] 4. 修改 `src/shared/types/ipc.ts`
  - `SendMessagePayload` 增加 `chatId: string` 字段
  - _需求：需求 1_

- [ ] 5. 修改 `src/main/handlers/chat-handlers.ts`
  - `chat:send-message`：从 payload 提取 chatId，传递给 `startStreamingSession(mainWindow, chatId)` 和对应 session 的 messageQueue
  - `chat:reset-session`：接受 `(chatId: string, resumeSessionId?)` 参数
  - `chat:stop-message`：接受 `(chatId: string)` 参数
  - `chat:set-model-preference`：遍历 sessionManager.listActive() 更新所有活跃 session
  - OpenAI 路径：仅在 IPC emit 中增加 chatId，暂不支持多实例
  - _需求：需求 1, 需求 3_

- [ ] 6. 修改 `src/main/lib/openai-session.ts`
  - 所有 `mainWindow.webContents.send()` 调用增加 `chatId` 到 payload
  - `sendOpenAIMessage`、`interruptOpenAIResponse`、`resetOpenAISession` 接受 chatId 参数
  - _需求：需求 1_

- [ ] 7. 修改 `src/main/lib/agent-runtime.ts`
  - `runtimeEventToIpc(event, chatId)` 增加 chatId 参数，所有返回的 args 中注入 chatId
  - _需求：需求 1_

- [ ] 8. 修改 `src/preload/index.ts`
  - `chat.sendMessage(payload)` — payload 类型已含 chatId，无需改动
  - `chat.stopMessage(chatId)` — 增加 chatId 参数
  - `chat.resetSession(chatId, resumeSessionId?)` — 增加 chatId 参数
  - 所有 `on*` 回调签名变更，callback 接收含 chatId 的对象
  - _需求：需求 1_

- [ ] 9. 修改 `src/renderer/electron.d.ts`
  - 同步 preload 的类型变更
  - 所有 chat event callback 类型增加 chatId
  - stopMessage/resetSession 签名增加 chatId
  - _需求：需求 1_

- [ ] 10. 新建 `src/renderer/stores/chatStore.ts` — 全局 ChatStore
  - `ChatState` 接口（messages、isLoading、isStreaming、sessionId、backgroundTasks、retryStatus、debugMessages、subscribers）
  - `chatStates: Map<string, ChatState>` 全局 store
  - `conversationToChatId` / `chatIdToConversation` 双向映射
  - `initGlobalListeners()` — 注册所有 IPC 事件监听器，按 chatId 分发到对应 state
  - `getOrCreateState(chatId)` / `destroyChatState(chatId)`
  - `registerConversationMapping(conversationId, chatId)`
  - `getConversationStatus(conversationId)` — 返回 'idle' | 'running' | 'error'
  - 后台对话自动保存（markDirty + debounce）
  - _需求：需求 1, 需求 2_

- [ ] 11. 重构 `src/renderer/hooks/useClaudeChat.ts`
  - 改为全局 ChatStore 的薄包装
  - `useClaudeChat(chatId: string | null)` — 订阅对应 chatId 的 state 变化
  - 返回值不变（messages, setMessages, isLoading, setIsLoading, backgroundTasks, retryStatus）
  - 增加 sessionId 返回值
  - _需求：需求 1_

- [ ] 12. 修改 `src/renderer/pages/Chat.tsx`
  - 新增 `activeChatId` 状态（初始值 `crypto.randomUUID()`）
  - `useClaudeChat(activeChatId)` 替代 `useClaudeChat()`
  - 移除 `currentSessionId` 状态（改用 hook 返回的 sessionId）
  - `handleNewChat`：不调用 resetSession，生成新 chatId 切换
  - `handleLoadConversation`：复用已打开的 chatId 或创建新的
  - 移除 `handleNewChat` 和 `handleLoadConversation` 的 `if (isLoading) return` 阻塞
  - `handleSendMessage`：payload 包含 `chatId: activeChatId`
  - `handleStopStreaming`：`stopMessage(activeChatId)`
  - 自动保存回调中注册 conversationId→chatId 映射
  - _需求：需求 1, 需求 3_

- [ ] 13. 左侧对话列表显示运行状态
  - 找到侧边栏对话列表组件
  - 使用 `getConversationStatus(conversationId)` 获取状态
  - 运行中显示动画指示器，错误显示错误指示器
  - _需求：需求 2_

- [ ] 14. Session 销毁集成
  - `conversation:delete` 时通知 renderer 清理 chatState
  - `conversation:delete` 时通知 main process 销毁对应 session
  - 新增 IPC：`chat:destroy-session(chatId)` 用于 renderer 主动销毁
  - _需求：需求 1_

- [ ] 15. 运行 lint + typecheck + test 验证
  - `bun run lint`
  - `bun run typecheck`
  - `bun run test`
  - 修复所有错误
  - _需求：所有_
