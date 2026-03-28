# 技术设计：AI Elements 组件库迁移

## 架构概览

```mermaid
graph TD
    subgraph 数据层（不改动）
        A[useClaudeChat hook] --> B[Message / ContentBlock 类型]
        C[IPC 协议] --> A
    end

    subgraph 适配层（新增）
        B --> D[adapters.ts]
        D --> E[AI Elements Props]
    end

    subgraph 渲染层（迁移）
        E --> F[AI Elements Conversation]
        E --> G[AI Elements Message]
        E --> H[AI Elements Reasoning]
        E --> I[AI Elements Tool / Terminal / CodeBlock]
        E --> J[AI Elements PromptInput]
        E --> K[AI Elements Attachments]
    end
```

核心思路：**数据层尽量不动**，新增适配层将现有类型映射到 AI Elements 的 props，渲染层用 AI Elements 组件替换。对于适配层无法可靠推导的状态（如工具流式生命周期），允许在数据层做最小扩展。

## 安装方式

AI Elements 使用 shadcn/ui 的 copy-paste 模式，通过 CLI 安装组件到项目源码中。

### shadcn 初始化（关键：适配 Electron renderer 目录结构）

当前仓库没有 `components.json`，Tailwind 使用 v4 CSS-first 配置，renderer root 在 `src/renderer`。初始化时需正确配置：

```json
// components.json（手动创建，避免 CLI 向导猜错路径）
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "tailwind": {
    "config": "",
    "css": "src/renderer/index.css",
    "baseColor": "neutral"
  },
  "aliases": {
    "components": "@renderer/components",
    "utils": "@renderer/lib/utils",
    "ui": "@renderer/components/ui",
    "lib": "@renderer/lib"
  },
  "registries": {
    "ai-elements": {
      "url": "https://elements.ai-sdk.dev/r"
    }
  }
}
```

组件代码落入 `src/renderer/components/ai-elements/` 目录。

```bash
# 逐个安装所需组件（使用 registry 别名）
npx shadcn@latest add "https://elements.ai-sdk.dev/r/conversation"
npx shadcn@latest add "https://elements.ai-sdk.dev/r/message"
npx shadcn@latest add "https://elements.ai-sdk.dev/r/reasoning"
npx shadcn@latest add "https://elements.ai-sdk.dev/r/tool"
npx shadcn@latest add "https://elements.ai-sdk.dev/r/prompt-input"
npx shadcn@latest add "https://elements.ai-sdk.dev/r/attachments"
npx shadcn@latest add "https://elements.ai-sdk.dev/r/terminal"
npx shadcn@latest add "https://elements.ai-sdk.dev/r/code-block"
npx shadcn@latest add "https://elements.ai-sdk.dev/r/file-tree"
npx shadcn@latest add "https://elements.ai-sdk.dev/r/artifact"
npx shadcn@latest add "https://elements.ai-sdk.dev/r/model-selector"
npx shadcn@latest add "https://elements.ai-sdk.dev/r/suggestion"
```

## 需要修改的文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/renderer/lib/ai-elements-adapters.ts` | 类型适配层：Message → AI Elements props |
| `src/renderer/components/ai-elements/` | AI Elements 安装目录（CLI 自动生成） |

### 修改文件（核心迁移）

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/Chat.tsx` | 替换 MessageList → Conversation，ChatInput → PromptInput |
| `src/renderer/components/Message.tsx` | 重写为包装 AI Elements Message 的适配组件 |
| `src/renderer/components/MessageList.tsx` | 替换为 AI Elements Conversation（移除 TanStack Virtual） |
| `src/renderer/components/ChatInput.tsx` | 替换为 AI Elements PromptInput |
| `src/renderer/components/BlockGroup.tsx` | 替换为 Reasoning + Tool 组合 |
| `src/renderer/components/ToolUse.tsx` | 路由改为 Terminal / CodeBlock / FileTree / Tool |
| `src/renderer/components/MessageFeedback.tsx` | 移除，功能并入 Message 的 MessageActions |
| `src/renderer/components/Markdown.tsx` | 保留但仅用于非聊天场景（ArtifactPanel），聊天内使用 MessageResponse |
| `src/renderer/components/AttachmentPreviewList.tsx` | 替换为 AI Elements Attachments |
| `src/renderer/components/DeliverableCard.tsx` | 替换为 AI Elements Artifact 子组件 |
| `src/renderer/components/ArtifactPanel.tsx` | 内部代码渲染替换为 CodeBlock |
| `src/renderer/index.css` | 添加 streamdown 的 `@source` 指令 |

### 修改文件（Tool 组件）

| 文件 | 改动 |
|------|------|
| `src/renderer/components/tools/BashTool.tsx` | 输出区域改用 AI Elements Terminal |
| `src/renderer/components/tools/ReadTool.tsx` | 代码内容改用 CodeBlock |
| `src/renderer/components/tools/WriteTool.tsx` | 代码内容改用 CodeBlock |
| `src/renderer/components/tools/EditTool.tsx` | 代码内容改用 CodeBlock |
| `src/renderer/components/tools/GlobTool.tsx` | 文件列表改用 FileTree |
| `src/renderer/components/tools/CollapsibleTool.tsx` | 替换为 AI Elements Tool 外壳 |
| `src/renderer/components/tools/toolBadgeConfig.tsx` | 简化，部分逻辑由 Tool 组件内置处理 |
| `src/renderer/components/tools/GrepTool.tsx` | 改用 AI Elements Tool 通用组件 |
| `src/renderer/components/tools/WebSearchTool.tsx` | 改用 AI Elements Tool 通用组件 |
| `src/renderer/components/tools/WebFetchTool.tsx` | 改用 AI Elements Tool 通用组件 |
| `src/renderer/components/tools/TaskTool.tsx` | 改用 AI Elements Tool 通用组件 |
| `src/renderer/components/tools/TodoWriteTool.tsx` | 改用 AI Elements Tool 通用组件 |
| `src/renderer/components/tools/SkillTool.tsx` | 改用 AI Elements Tool 通用组件 |
| `src/renderer/components/tools/NotebookEditTool.tsx` | 改用 AI Elements Tool 通用组件 |
| `src/renderer/components/tools/KillShellTool.tsx` | 改用 AI Elements Tool 通用组件 |
| `src/renderer/components/tools/BashOutputTool.tsx` | 改用 AI Elements Terminal |

### 可能删除的文件

| 文件 | 原因 |
|------|------|
| `src/renderer/components/tools/utils.tsx` | ToolHeader/MonoText 等被 AI Elements 取代 |

注意：`MessageFeedback.tsx` **不删除**，重构为 `FeedbackDialog` 组件（保留负反馈原因枚举 + 评论 + analytics 提交的完整业务逻辑）。

## 适配层设计

### 核心类型映射

```typescript
// src/renderer/lib/ai-elements-adapters.ts

import type { Message, ContentBlock, ToolUseSimple, MessageAttachment } from '../types/chat';
import type { ChatModelPreference } from '../../shared/types/ipc';

// ── Tool 状态适配 ──
// 注意：当前 ToolUseSimple 的流式状态机包括：
//   tool_use_start → tool_input_delta (累积 inputJson) → tool_result_start → tool_result_delta → complete
// isLoading 仅在消息级别，不在单个 tool 上。需要结合 inputJson/parsedInput/result 综合判断。

type AIElementsToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error';

export function mapToolState(tool: ToolUseSimple): AIElementsToolState {
  // 有 inputJson 但 parsedInput 解析失败 → 仍在流式输入
  if (tool.inputJson && !tool.parsedInput && !tool.result) return 'input-streaming';
  // 有 parsedInput 但无 result → 工具正在执行
  if (tool.parsedInput && !tool.result && !tool.isError) return 'input-available';
  // 有 result 但内容仍在增长（通过外部 isStreaming 判断）→ output-available（流式输出无独立状态）
  if (tool.isError) return 'output-error';
  if (tool.result) return 'output-available';
  return 'input-streaming'; // fallback：刚开始，啥都没有
}

// ── Thinking → Reasoning 适配 ──

export function mapThinkingToReasoning(block: ContentBlock) {
  return {
    isStreaming: !block.isComplete,
    duration: block.thinkingDurationMs,
    content: block.thinking ?? '',
  };
}

// ── 附件适配 ──
// 附件有多种形态：
// 1. 发送前：有 File 对象 + previewUrl（blob URL）
// 2. 发送后：previewUrl 可能被清除，只有 savedPath/relativePath
// 3. 历史回放：只有 metadata，无 File 无 blob URL
// AI Elements Attachments 组件需要可渲染的数据，fallback 到文件卡片展示

export function mapAttachment(att: MessageAttachment) {
  // 优先用 previewUrl（发送前的 blob URL）
  // 其次用 savedPath 构建 file:// URL（Electron 可访问本地文件）
  // 最后 fallback 到空字符串（Attachments 组件会显示文件图标卡片）
  const dataUrl = att.previewUrl
    ?? (att.savedPath ? `file://${att.savedPath}` : '');

  return {
    id: att.id,
    type: 'file' as const,
    data: dataUrl,
    mimeType: att.mimeType ?? (att.isImage ? 'image/*' : 'application/octet-stream'),
    name: att.name ?? att.file?.name ?? 'file',
    // 额外保留的信息，供自定义渲染使用
    _meta: {
      size: att.size,
      savedPath: att.savedPath,
      relativePath: att.relativePath,
    },
  };
}

// ── Model Selector 适配 ──
// 支持 Anthropic 默认模型 + 自定义模型 + 按档位覆盖

export function mapModelPreference(
  pref: ChatModelPreference,
  customModelIds?: Record<string, string>,
) {
  const defaults: Record<string, { id: string; name: string; provider: string }> = {
    fast: { id: 'claude-haiku-4-5-20251001', name: 'Haiku', provider: 'anthropic' },
    'smart-sonnet': { id: 'claude-sonnet-4-5-20250929', name: 'Sonnet', provider: 'anthropic' },
    'smart-opus': { id: 'claude-opus-4-5-20251101', name: 'Opus', provider: 'anthropic' },
  };

  const base = defaults[pref] ?? defaults['smart-sonnet'];

  // 如果有自定义模型覆盖，使用自定义 ID
  if (customModelIds?.[pref]) {
    return { ...base, id: customModelIds[pref], name: customModelIds[pref] };
  }

  return base;
}
```

### 关键适配问题

1. **AI Elements 依赖 `@ai-sdk/react` 的类型**（如 `UIMessage`、`ToolUIPart`）：由于 copy-paste 模式，安装后的组件源码在我们项目中，**直接修改组件源码**移除 AI SDK 类型依赖，改为接受我们的类型或泛型 props。这比引入 `ai` / `@ai-sdk/react` 作为运行时依赖更安全——避免包体积膨胀和运行时副作用。安装组件后需**逐个审计 import**，将 AI SDK 运行时引用替换为我们的类型。

2. **保留虚拟滚动**：~~放弃 TanStack Virtual~~ → **在 Conversation 组件内部保留 TanStack Virtual**。会话是持久化的，没有消息条数上限，单条消息也可能极大（长 diff、debug output）。用 Conversation 的 `stick-to-bottom` 处理自动滚动逻辑，但消息渲染仍走虚拟化。具体做法：将 `ConversationContent` 内部的 children 渲染替换为 TanStack Virtual 的 `useVirtualizer`。

3. **MessageResponse 需要 streamdown CSS**：需在 `index.css` 中添加 `@source "../../node_modules/streamdown/dist/*.js"`（注意路径：index.css 在 `src/renderer/`，需要向上两级才能到达 `node_modules`）。

4. **BlockGroup 聚合语义保留**：不能简单地拆成独立的 Reasoning / Tool 卡片。保留 BlockGroup 作为聚合容器，内部渲染改用 AI Elements 组件。BlockGroup 继续负责：
   - 聚合连续 thinking/tool block
   - 只自动展开最后一个活动分组
   - 后面有正文时收起中间过程
   内部的各个 block 用 Reasoning / Tool 渲染，但聚合逻辑保留。

5. **外链安全**：MessageResponse 渲染的 markdown 中所有 `<a>` 标签必须拦截 click 事件，走 `window.electron.shell.openExternal()`。通过 MessageResponse 的 `components` prop 注入自定义 `a` 组件实现。

6. **工具输入 partial parse fallback**：当 `parsedInput` 尚未解析完成时，显示 AI Elements Tool 的 `input-streaming` 状态（显示 inputJson 原始文本），而非空白或闪烁。

7. **Glob → FileTree 的数据转换**：Glob 输出是换行分隔的路径列表字符串，需转换为树结构。新增 `parseGlobToTree(result: string)` 工具函数，将平铺路径列表构建为 `FileTreeFolder` / `FileTreeFile` 的嵌套结构。

## 组件迁移详细设计

### 1. Chat.tsx（页面骨架）

```
Before:                          After:
┌─────────────────────┐         ┌─────────────────────┐
│ MessageList          │         │ Conversation         │
│  └─ Message[]       │         │  └─ ConversationContent │
│      └─ BlockGroup  │   →     │      └─ Message[]    │
│      └─ Markdown    │         │          └─ Reasoning │
│      └─ Feedback    │         │          └─ Tool      │
├─────────────────────┤         ├─────────────────────┤
│ ChatInput           │         │ PromptInput          │
│  └─ ModelSelector   │   →     │  └─ ModelSelector    │
│  └─ SlashCommand    │         │  └─ Attachments      │
│  └─ Attachments     │         │  └─ PromptInputSubmit│
└─────────────────────┘         └─────────────────────┘
```

### 2. Message 组件迁移

**当前**：一个大型 Message.tsx 组件处理 user/assistant 两种角色、text/thinking/tool_use 三种 content block、deliverable 提取、error 显示。

**迁移后**：

```tsx
// 伪代码示意
<Message from={message.role}>
  {/* 用户消息 */}
  {message.role === 'user' && (
    <>
      <MessageContent>
        <MessageResponse>{message.content as string}</MessageResponse>
      </MessageContent>
      {message.attachments && (
        <Attachments variant="inline">
          {message.attachments.map(att => (
            <Attachment key={att.id} data={mapAttachment(att)} />
          ))}
        </Attachments>
      )}
    </>
  )}

  {/* 助手消息 */}
  {message.role === 'assistant' && (
    <>
      <MessageContent>
        {renderContentBlocks(message.content)}
      </MessageContent>
      <MessageActions>
        <MessageAction tooltip="复制" onClick={...}>
          <Copy />
        </MessageAction>
        <MessageAction tooltip="点赞" onClick={...}>
          <ThumbsUp />
        </MessageAction>
        <MessageAction tooltip="踩" onClick={...}>
          <ThumbsDown />
        </MessageAction>
      </MessageActions>
    </>
  )}

  {/* 错误消息 */}
  {message.errorMeta && (
    <div className="error-banner">
      <p>{message.content}</p>
      {message.errorMeta.actionType === 'settings' && (
        <button onClick={onOpenSettings}>前往设置</button>
      )}
      {message.errorMeta.actionType === 'retry' && (
        <button onClick={onRetryMessage}>重试</button>
      )}
      <button onClick={() => copyToClipboard(message.errorMeta.rawError)}>
        复制错误详情
      </button>
    </div>
  )}

  {/* Deliverable 卡片 → Artifact */}
  {deliverables.map(d => (
    <Artifact key={d.id}>
      <ArtifactHeader>
        <ArtifactTitle>{d.fileName}</ArtifactTitle>
      </ArtifactHeader>
    </Artifact>
  ))}

  {/* MessageFeedback 完整保留业务逻辑 */}
  {message.role === 'assistant' && !message.errorMeta && (
    <MessageActions>
      <MessageAction tooltip="复制" onClick={handleCopy}><Copy /></MessageAction>
      <MessageAction tooltip="有用" onClick={() => handleFeedback('positive')}><ThumbsUp /></MessageAction>
      <MessageAction tooltip="无用" onClick={() => openFeedbackDialog('negative')}><ThumbsDown /></MessageAction>
    </MessageActions>
  )}
</Message>

{/* 负反馈弹窗保留完整交互：原因枚举 + 自由评论 + analytics 提交 */}
{feedbackDialogOpen && (
  <FeedbackDialog
    reasons={NEGATIVE_REASONS}
    onSubmit={(reason, comment) => analytics.submitFeedback({ ... })}
    onClose={() => setFeedbackDialogOpen(false)}
  />
)}
```

**注意**：MessageFeedback 不是简单的图标按钮替换。负反馈流包含 6 种预定义原因 + 自由评论 + analytics 埋点提交。迁移时将 thumbs up/down 按钮放入 `MessageActions`，但负反馈弹窗逻辑单独保留为 `FeedbackDialog` 组件。

### 3. BlockGroup 保留聚合 + 内部用 AI Elements

**保留 BlockGroup 作为聚合容器**（Codex 审查指出其职责被低估）。BlockGroup 继续负责：
- 聚合连续 thinking/tool block 为一组
- 只自动展开最后一个活动分组
- 后面有正文时收起中间过程
- 折叠/展开的手动 toggle

**内部渲染改用 AI Elements 组件**：
- **thinking block** → `<Reasoning isStreaming={!block.isComplete} duration={block.thinkingDurationMs}>` 渲染内容
- **tool_use block** → 路由到 Terminal / CodeBlock / FileTree / 通用 Tool

BlockGroup 的展开/折叠 badge UI 也用 AI Elements 的组件风格重新实现，但聚合逻辑保持原样。

### 4. Tool 组件混合策略

| 工具名 | 使用组件 | 渲染方式 |
|--------|----------|----------|
| Bash, BashOutput | **Terminal** | `<Terminal output={result} isStreaming={isLoading} />` |
| Read | **CodeBlock** | `<CodeBlock code={result} language={detectLang(filePath)} />` |
| Write | **CodeBlock** | `<CodeBlock code={input.content} language={detectLang(filePath)} />` |
| Edit | **CodeBlock** | diff 视图（old → new） |
| Glob | **FileTree** | `<FileTree>` 渲染匹配文件列表 |
| Grep, WebSearch, WebFetch, Task, TodoWrite, Skill, NotebookEdit, KillShell | **Tool（通用）** | `<Tool><ToolHeader state={mapToolState(tool)} /><ToolInput /><ToolOutput /></Tool>` |

### 5. ChatInput → PromptInput

```tsx
<PromptInput onSubmit={handleSend}>
  <PromptInputBody>
    <PromptInputTextarea placeholder="输入消息..." />
    <PromptInputFooter>
      <PromptInputTools>
        <PromptInputActionAddAttachments />
        <ModelSelector>
          <ModelSelectorTrigger />
          <ModelSelectorContent>
            {models.map(m => <ModelSelectorItem key={m.id} ... />)}
          </ModelSelectorContent>
        </ModelSelector>
      </PromptInputTools>
      <PromptInputSubmit status={isLoading ? 'streaming' : 'ready'} />
    </PromptInputFooter>
  </PromptInputBody>
</PromptInput>
```

保留的自定义逻辑（需在 PromptInput 外部或通过 props 接回 Chat.tsx）：
- SlashCommandMenu（AI Elements 的 PromptInputCommand 可替代，使用 `PromptInputCommand` 子组件）
- 文件大小验证（32MB 限制，通过 `maxFileSize` prop 传入）
- IME 组合输入处理（PromptInput 内置支持 Enter/Shift+Enter，需验证 IME 兼容性）
- **高度上报**：当前 ChatInput 通过 ResizeObserver 上报高度驱动 MessageList 底部 padding。迁移后使用 Conversation 的 stick-to-bottom 机制，不再需要手动 padding 计算
- **Stop 按钮**：PromptInputSubmit 在 `status='streaming'` 时自动显示停止按钮
- **floatingPanel 承载**：floatingPanel 移到 PromptInput 外部的 Chat.tsx 层渲染
- **空文本 + 有附件的提交**：通过 PromptInput 的 `onSubmit` 回调，检查 attachments 是否非空来决定是否允许提交
- **拖拽/粘贴上传**：PromptInput 内置 `globalDrop` 支持，粘贴上传需验证是否内置

### 6. MessageList → Conversation + 虚拟滚动

```tsx
<Conversation>
  <ConversationContent>
    {messages.length === 0 && (
      <ConversationEmptyState
        title="有什么可以帮你的？"
        description="输入消息开始对话"
      />
    )}
    {/* 保留 TanStack Virtual 虚拟化渲染 */}
    <VirtualizedMessages messages={messages} ... />
  </ConversationContent>
  <ConversationScrollButton />
</Conversation>
```

**策略**：使用 Conversation 的 `stick-to-bottom` 处理自动滚动和 scroll-to-bottom 按钮，但在 ConversationContent 内部保留 TanStack Virtual 虚拟化。会话持久化且无消息上限，虚拟滚动不可省略。

### 7. ArtifactPanel 部分迁移

仅替换代码高亮部分：

```tsx
// Before: Shiki 手动调用
const html = await codeToHtml(content, { ... });
<div dangerouslySetInnerHTML={{ __html: html }} />

// After: AI Elements CodeBlock
<CodeBlock code={content} language={language} showLineNumbers />
```

HTML preview（iframe sandbox）和 Image preview 保持不变。异步磁盘读取逻辑（`DiskLoadResult` 状态机、`loadingPathRef` 防重复读取）完全保留，仅替换最终渲染组件。

### 8. 超长内容折叠策略

当前有多层折叠机制防止 DOM 体量爆炸，迁移后必须保留等效能力：

| 场景 | 当前实现 | 迁移后 |
|------|----------|--------|
| Markdown 中超长代码块（>200行） | `CollapsiblePre` 自动折叠 | 通过 MessageResponse 的 `components` prop 注入同等的 CollapsiblePre |
| 工具输出过长 | `CollapsibleTool` 默认折叠 | AI Elements Tool 内置折叠（defaultOpen=false），大段输出保持折叠 |
| Terminal 输出 | 无限滚动 | Terminal 组件的 `autoScroll` + 固定高度容器（max-h-64）限制可见区域 |
| CodeBlock 大文件 | Shiki 延迟渲染 | CodeBlock 的 `contentVisibility` 优化 + 超过 500 行时截断并显示"展开全部" |

### 9. 错误消息迁移方案

错误消息是独立的助手消息，有 `errorMeta` 字段。迁移后：
- 错误消息**不使用** AI Elements Message 的标准渲染路径
- 保留自定义错误 banner UI（红色背景、CTA 按钮）
- 支持三种 action：`settings`（前往设置）、`retry`（重试）、复制 rawError
- retry 行为保留：移除错误消息 → 重新发送上一条用户消息

## 依赖变更

### 新增依赖

```json
{
  "streamdown": "^x.x",       // MessageResponse 的 markdown 流式渲染
  "stick-to-bottom": "^x.x",  // Conversation 的自动滚动
  "ansi-to-react": "^x.x",    // Terminal 的 ANSI 颜色渲染
  "cmdk": "^x.x"              // ModelSelector 的搜索/键盘导航
}
```

**不引入** `ai` 和 `@ai-sdk/react`——安装后的 AI Elements 组件源码中如有这些依赖的运行时 import，直接改为我们的类型。

### 保留的依赖

```json
{
  "@tanstack/react-virtual": "^3.x"  // 保留虚拟滚动，嵌入 Conversation 内部
}
```

注意：`react-markdown` 和 `remark-gfm` 保留，因为 ArtifactPanel 和其他非聊天场景仍然使用 Markdown 组件。

## 测试策略

1. **TypeScript 类型检查**：`bun run typecheck` 确保所有类型映射正确
2. **Lint**：`bun run lint` 确保代码风格一致
3. **Build**：`bun run build` 确保生产构建成功
4. **单元测试**：`bun run test` 确保现有测试通过
5. **手动验证**：`bun run dev` 启动后检查聊天功能完整性

## 安全考虑

- AI Elements 组件通过 copy-paste 模式安装，代码完全本地化，无运行时外部依赖
- `MessageResponse` 的 `allowedImagePrefixes` 和 `allowedLinkPrefixes` 可限制 markdown 中的外部资源
- 现有的 iframe sandbox 限制（ArtifactPanel）保持不变

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| AI Elements 组件源码可能与现有 Tailwind 配置冲突 | 安装后检查样式，必要时调整 CSS 变量 |
| AI Elements 组件源码有 `ai` / `@ai-sdk/react` 运行时引用 | 安装后逐个审计 import，将运行时引用替换为我们的类型。**不引入 `ai` / `@ai-sdk/react` 作为运行时依赖** |
| 安装 AI Elements 组件可能拉入额外 shadcn 依赖 | 安装时检查自动添加的依赖，避免冲突 |
| 附件组件与历史消息存储不一致 | 适配层处理三种附件形态（发送前/发送后/历史回放），通过 `file://` URL 或文件图标 fallback |
| Glob 输出是平铺路径列表，不是树结构 | 新增 `parseGlobToTree()` 转换函数 |
| 外链点击可能绕过 Electron shell.openExternal | 通过 MessageResponse 的 `components` prop 注入自定义 `<a>` 标签拦截 |
| shadcn 初始化目录/alias 配置错误 | 手动创建 `components.json`，不依赖 CLI 向导 |
