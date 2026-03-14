# 技术设计文档

## 架构概览

本次改动涉及 4 个独立功能，均遵循现有 IPC 架构（main → preload → renderer）。改动主要集中在 renderer 层（UI 交互）和 main 层（搜索逻辑、错误重试），不涉及 Claude Agent SDK 的接口变更。

```
需求 #63 拖拽文件 ─── 纯 renderer 层改动
需求 #64 全文搜索 ─── main + preload + renderer
需求 #71 虚拟滚动 ─── 纯 renderer 层改动
需求 #72 错误优化 ─── main + renderer
```

---

## 需求 #63：拖拽文件到输入框

### 现状分析

`ChatInput.tsx` 已实现了拖拽到输入框区域的功能（`handleDragEnter/Over/Leave/Drop`），但作用范围仅限于 ChatInput 组件内部。用户需要精确拖到输入框上才能放置文件。

### 设计方案

**将拖拽区域扩展到整个 Chat 页面**，在 `Chat.tsx` 添加全局 drag 事件监听，拖拽时显示全屏 overlay，松开后调用已有的 `handleFilesSelected()`。

```
Chat.tsx (全局 drag 监听)
  └─ DropZoneOverlay.tsx (全屏半透明蒙层，仅拖拽时显示)
  └─ handleFilesSelected() (已有，复用)
  └─ suggestPromptForFiles() (新增，文件类型 → 推荐 prompt)
```

#### 关键实现细节

1. **dragenter/dragleave 计数器**：使用 `dragCounterRef` 处理嵌套元素的进出事件（ChatInput 已有此模式）
2. **DropZoneOverlay**：`fixed inset-0 z-50` 全屏蒙层，带动画过渡
3. **推荐 prompt**：根据拖入文件的扩展名，在 `inputValue` 为空时预填推荐文字。多种类型混合或无法识别时不预填
4. **不自动发送**：文件仅添加到 `pendingAttachments`，用户需手动按回车发送

#### 需要修改的文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/Chat.tsx` | 添加全局 drag 事件监听、overlay 状态、推荐 prompt 逻辑 |
| `src/renderer/components/DropZoneOverlay.tsx` | 新建，全屏拖拽 overlay |

---

## 需求 #64：全文搜索历史对话

### 现状分析

- 对话存储在 `~/.config/Claude Agent Desktop/conversations/*.json`
- `Sidebar.tsx` 的搜索仅匹配标题和 preview 文本（`getFilteredConversationsForProject`）
- `conversation-db.ts` 的 `listConversations()` 已加载所有对话文件

### 设计方案

**简单遍历方案**：在 main process 新增 `searchConversations()` 函数，遍历 JSON 文件搜索消息内容。

```
Sidebar.tsx
  ├─ 标题搜索（现有，本地过滤）
  └─ 全文搜索（新增，IPC 调用）
        ↓
conversation:search (新 IPC handler)
        ↓
conversation-db.ts → searchConversations(query)
  └─ 遍历 JSON → 解析 messages → 文本匹配
  └─ 返回 SearchResult[]
```

#### 搜索结果类型

```typescript
interface ConversationSearchResult {
  conversationId: string;
  title: string;
  matchSnippet: string;    // 匹配消息的上下文片段，约 80 字符
  matchRole: 'user' | 'assistant';
  updatedAt: number;
}
```

#### 关键实现细节

1. **搜索逻辑**：遍历每个 JSON 文件，解析 messages 数组，对每条消息的文本内容做 `includes()` 匹配（大小写不敏感）
2. **性能**：搜索在 main process 执行，不阻塞 renderer。结果上限 50 条
3. **snippet 提取**：匹配关键词前后各取 40 个字符作为片段
4. **防抖**：renderer 端 300ms debounce
5. **UI 展示**：搜索结果分为"标题匹配"和"内容匹配"两组，关键词高亮显示

#### 需要修改的文件

| 文件 | 改动 |
|------|------|
| `src/main/lib/conversation-db.ts` | 新增 `searchConversations()` |
| `src/main/handlers/conversation-handlers.ts` | 注册 `conversation:search` handler |
| `src/preload/index.ts` | 桥接 `conversation.search()` |
| `src/renderer/electron.d.ts` | 新增搜索相关类型 |
| `src/renderer/components/Sidebar.tsx` | 扩展搜索 UI，调用全文搜索，展示分组结果 |

---

## 需求 #71：长对话性能优化

### 现状分析

- `MessageList.tsx` 用 `messages.map()` 渲染所有消息 DOM（54 行，非常简单）
- `useAutoScroll.ts` 通过 `scrollTop/scrollHeight` 实现自动滚动
- 每个 `Message` 组件可能包含 markdown、代码块、工具调用等复杂内容

### 设计方案

**使用 `@tanstack/react-virtual` 实现虚拟滚动**。

```
MessageList.tsx (改造)
  └─ useVirtualizer({ count, getScrollElement, estimateSize })
  └─ 只渲染可视区域 + buffer 的消息
  └─ measureElement 动态测量每条消息高度
```

#### 关键实现细节

1. **虚拟化器配置**：
   - `count = messages.length`
   - `estimateSize` 预估每条消息高度（用户消息 ~60px，助手消息 ~200px）
   - `overscan = 5`（上下各多渲染 5 条）
   - `measureElement` 动态测量真实高度

2. **自动滚动兼容**：
   - `useAutoScroll` 需要适配虚拟滚动的 `scrollToIndex` API
   - 新消息到达时调用 `virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })`
   - 用户手动上滚时不触发自动滚动（已有 `isAutoScrollEnabledRef` 逻辑）

3. **长代码块折叠**：在 Message 组件的代码渲染逻辑中，超过 200 行的代码块默认折叠

4. **布局结构**：外层容器保持 `overflow-y: auto`，内部用 `div` 占位总高度，虚拟 items 用 `position: absolute` 或 `translateY` 定位

#### 需要修改的文件

| 文件 | 改动 |
|------|------|
| `package.json` | 添加 `@tanstack/react-virtual` 依赖 |
| `src/renderer/components/MessageList.tsx` | 虚拟滚动改造 |
| `src/renderer/hooks/useAutoScroll.ts` | 适配虚拟滚动 API |
| `src/renderer/components/Message.tsx` | 支持 `measureElement` ref 传递 |

---

## 需求 #72：错误体验优化

### 现状分析

- `claude-session.ts` 的 `stderr` 回调检测错误模式并发送 `chat:message-error`
- `friendlyError.ts` 将错误映射为中文消息（10 条映射规则）
- 无重试逻辑、无离线检测

### 设计方案

#### 1. 429 限流自动重试

在 `claude-session.ts` 的 `stderr` 回调中检测 429，不直接发送 error 事件，而是启动重试流程：

```
stderr 检测到 429
  ↓
发送 chat:retry-status { attempt, maxAttempts, retryInMs }
  ↓ 等待 retryInMs
重新发送上一条消息（通过 messageQueue）
  ↓
最多 3 次，全部失败后发送 chat:message-error
```

实际上考虑到 claude-session.ts 是 SDK 的 wrapper，429 是 SDK 内部处理的错误，会通过 stderr 输出。我们不需要在这一层重试，而是增强 UI 提示：

- 当 stderr 检测到 429 时，发送新事件 `chat:retry-status` 给 renderer
- Renderer 显示倒计时提示（SDK 自带的重试机制会自动重试）
- 如果最终超时/失败，显示友好错误消息

#### 2. 离线检测

纯 renderer 层实现：

```typescript
// useOnlineStatus.ts
function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { ... };
  }, []);
  return isOnline;
}
```

- `Chat.tsx` 使用此 hook，离线时在界面显示提示条
- `ChatInput` 接收 `disabled` prop，离线时禁用发送按钮

#### 3. 401/403 增强

增强 `friendlyError.ts` 映射，区分不同的认证错误：
- 401 → "API 密钥无效或已过期"
- 403 → "API 密钥权限不足或额度已用尽"
- 附带"前往设置"按钮

#### 4. 复制错误详情

错误消息组件增加"复制错误详情"按钮，复制原始错误信息到剪贴板。

#### 需要修改的文件

| 文件 | 改动 |
|------|------|
| `src/main/lib/claude-session.ts` | stderr 中检测 429 发送 retry-status 事件 |
| `src/preload/index.ts` | 桥接 `chat:retry-status` 事件 |
| `src/renderer/electron.d.ts` | 新增 retry-status 类型 |
| `src/renderer/hooks/useOnlineStatus.ts` | 新建，离线检测 hook |
| `src/renderer/hooks/useClaudeChat.ts` | 监听 retry-status，管理重试状态 |
| `src/renderer/pages/Chat.tsx` | 离线提示条、重试状态展示 |
| `src/renderer/components/ChatInput.tsx` | 离线时禁用发送 |
| `src/renderer/utils/friendlyError.ts` | 增强错误映射、添加错误元信息 |

---

---

## Codex 审查修复项

以下问题由 Codex 架构审查发现，已整合到上述方案中：

### 修复 1：拖拽事件冒泡重复（P1）
ChatInput 已有 drag/drop 处理。Chat.tsx 添加全局 drop 时，需要防止重复调用 `handleFilesSelected()`。**方案**：Chat.tsx 的 drop handler 检查 `event.defaultPrevented`，如果 ChatInput 已处理则跳过。

### 修复 2：搜索阻塞 main process（P0）
`searchConversations()` 不能用同步 `readFileSync`，会阻塞 Electron main process。**方案**：改用 `fs/promises` 的异步 API。

### 修复 3：消息内容结构化提取（P1）
消息 `content` 可能是 `string`、`ContentBlock[]`（含 text/thinking/tool_use），搜索不能只用 `includes()`。**方案**：复用 `conversation-db.ts` 已有的 `extractTextFromContent()` 模式，递归提取所有文本块再做匹配。

### 修复 4：错误消息无法挂载动作按钮（P0）
当前错误只是纯文本 assistant message，无法附加"前往设置"或"复制详情"等动作。**方案**：扩展 `Message` 类型，增加 `errorMeta?: { rawError: string; actionType?: 'settings' | 'retry' }` 字段。`useClaudeChat` 的 `onMessageError` 生成错误消息时附带 meta。Message 组件根据 `errorMeta` 渲染相应按钮。

### 修复 5：navigator.onLine 不可靠（P1）
Electron 上 `navigator.onLine` 可能误报，且用户可能使用本地/内网代理。**方案**：仅作为参考信号，用 toast 提示而非强制禁用发送按钮。发送失败时根据错误类型再判断是否网络问题。

### 修复 6：429 stderr 去重（P0）
SDK 自动重试期间会多次输出 429 到 stderr。**方案**：在 `claude-session.ts` 中引入 429 防抖：首次 429 发送 `chat:retry-status`，5s 内后续 429 静默忽略。只在 SDK 最终报错（非 429）或超时后才发送 `chat:message-error`。

### 修复 7：虚拟滚动与 useAutoScroll 联动（P1）
`useAutoScroll` 基于真实 DOM scrollHeight 工作，改成虚拟列表后需要同步改写。**方案**：在 `MessageList` 内部使用 `virtualizer.scrollToIndex()` 实现自动滚动，不再使用 `useAutoScroll`。

### 修复 8：代码块折叠位置（P1）
代码块由 `Markdown.tsx` 的 ReactMarkdown 渲染。**方案**：在 `Markdown.tsx` 的 `markdownComponents` 中自定义 `pre`/`code` 组件，超过 200 行时折叠。

---

## 测试策略

1. **单元测试**：`friendlyError.ts` 的映射规则、`searchConversations` 的搜索逻辑
2. **手动测试**：拖拽文件、离线切换、长对话滚动性能

## 安全考虑

- 全文搜索在 main process 执行，不暴露文件系统路径到 renderer
- 拖拽文件复用已有的 32MB 大小限制和文件名清理
- 错误消息不暴露 API key 或技术性 stack trace
