# 实施计划

- [ ] 1. 拖拽文件到输入框 (#63)
  - 在 `Chat.tsx` 添加全局 `dragenter/dragover/dragleave/drop` 事件监听
  - 新建 `DropZoneOverlay.tsx` 全屏半透明 overlay 组件（`fixed inset-0 z-50`，带过渡动画）
  - drop handler 检查 `event.defaultPrevented` 避免与 ChatInput 现有拖拽重复处理
  - 新建 `src/renderer/utils/filePromptSuggestion.ts`，根据文件扩展名返回推荐 prompt
  - drop 后调用已有 `handleFilesSelected()`，并在 `inputValue` 为空时预填推荐 prompt
  - _需求：需求 1_

- [ ] 2. 全文搜索历史对话 (#64)
  - 在 `conversation-db.ts` 新增 `searchConversations(query: string): Promise<ConversationSearchResult[]>`，使用异步 `fs/promises` API
  - 搜索逻辑：遍历 JSON 文件，解析 messages，用 `extractTextFromContent()` 提取文本，`toLowerCase().includes()` 匹配
  - snippet 提取：匹配关键词前后各 40 字符
  - 结果上限 50 条
  - 在 `conversation-handlers.ts` 注册 `conversation:search` IPC handler
  - 在 `preload/index.ts` 桥接 `conversation.search(query)`
  - 在 `electron.d.ts` 新增 `ConversationSearchResult` 和 `ConversationSearchResponse` 类型
  - 扩展 `Sidebar.tsx` 搜索功能：输入 ≥ 2 字符时调用全文搜索（300ms debounce），结果分"标题匹配"和"内容匹配"两组展示，关键词高亮
  - _需求：需求 2_

- [ ] 3. 错误体验优化 (#72)
  - 在 `claude-session.ts` 的 stderr 回调中添加 429 防抖逻辑：首次 429 发送 `chat:retry-status`，5s 内后续 429 静默忽略
  - 在 `preload/index.ts` 桥接 `chat:retry-status` 事件
  - 在 `electron.d.ts` 新增 `RetryStatus` 类型
  - 在 `useClaudeChat.ts` 监听 `chat:retry-status`，暴露 `retryStatus` 状态
  - 扩展 `Message` 类型增加 `errorMeta?: { rawError: string; actionType?: 'settings' | 'retry' }`
  - 修改 `useClaudeChat.ts` 的 `onMessageError`：根据错误类型附带 errorMeta（401/403 → settings，429/网络 → retry）
  - 增强 `friendlyError.ts`：区分 401 vs 403，添加 `classifyError()` 返回错误分类
  - 在 `Message.tsx` 中根据 `errorMeta` 渲染"前往设置"/"重试"/"复制错误详情"按钮
  - 新建 `useOnlineStatus.ts` hook，监听 `online/offline` 事件
  - 在 `Chat.tsx` 使用 `useOnlineStatus`，离线时显示 toast 提示条（不强制禁用发送按钮）
  - _需求：需求 4_

- [ ] 4. 长对话虚拟滚动 (#71)
  - 安装 `@tanstack/react-virtual` 依赖
  - 重写 `MessageList.tsx`：使用 `useVirtualizer` 虚拟化消息列表
    - `count = messages.length`（加上 loading 行则 +1）
    - `estimateSize` 根据 message role 预估高度
    - `overscan = 5`
    - 使用 `measureElement` 动态测量真实高度
  - 在 `MessageList` 内部实现自动滚动逻辑（取代 `useAutoScroll`）：
    - 新消息到达时，如果用户在底部则 `scrollToIndex(last, { align: 'end' })`
    - 用户手动上滚时禁用自动滚动
  - 更新 `Chat.tsx`：不再传入 `containerRef` from `useAutoScroll`，改为 MessageList 自管理
  - 在 `Markdown.tsx` 的 `markdownComponents` 中自定义 `pre`/`code` 组件，超过 200 行折叠
  - _需求：需求 3_
