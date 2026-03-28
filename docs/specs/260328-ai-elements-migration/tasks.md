# 实施计划

- [x] 1. 初始化 shadcn 配置 + 安装 AI Elements 组件
  - 创建 `components.json`（手动，适配 Electron renderer 目录结构）
  - 逐个安装所需 AI Elements 组件（conversation, message, reasoning, tool, prompt-input, attachments, terminal, code-block, file-tree, artifact, model-selector, suggestion）
  - 安装运行时依赖（streamdown, stick-to-bottom, ansi-to-react, cmdk）
  - 审计安装后的组件源码，移除 `ai` / `@ai-sdk/react` 运行时 import
  - 添加 streamdown 的 `@source` 到 `index.css`
  - 验证：`bun run typecheck` 通过
  - _需求：7（适配层基础设施）_

- [x] 2. 创建适配层 + 工具函数
  - 创建 `src/renderer/lib/ai-elements-adapters.ts`
  - 实现 `mapToolState()`、`mapThinkingToReasoning()`、`mapAttachment()`、`mapModelPreference()`
  - 实现 `parseGlobToTree()` — 将 Glob 平铺路径列表转为 FileTree 树结构
  - 实现 `detectLanguage()` — 根据文件路径推断编程语言
  - 创建自定义 ExternalLink 组件用于 MessageResponse 的 `components` prop
  - 验证：`bun run typecheck` 通过
  - _需求：7_

- [x] 3. 迁移 Message 组件
  - 重写 `Message.tsx` 使用 AI Elements `Message`、`MessageContent`、`MessageResponse`、`MessageActions`
  - 保留错误消息的自定义渲染（errorMeta → CTA 按钮）
  - 保留 Deliverable 提取逻辑，用 AI Elements Artifact 渲染卡片
  - 注入 ExternalLink 到 MessageResponse 的 `components` prop
  - 注入 CollapsiblePre 到 MessageResponse 处理超长代码块
  - _需求：1, 6_

- [x] 4. 迁移 BlockGroup 组件
  - 保留聚合逻辑（连续 thinking/tool block 分组、自动展开最后活动分组、正文后收起）
  - 内部 thinking block 渲染改用 AI Elements Reasoning
  - 内部 tool_use block 路由改用 AI Elements Tool / Terminal / CodeBlock / FileTree
  - 更新 badge UI 风格
  - _需求：2, 3_

- [x] 5. 迁移 Tool 组件（混合策略）
  - `BashTool.tsx` / `BashOutputTool.tsx`：输出区域改用 AI Elements Terminal
  - `ReadTool.tsx` / `WriteTool.tsx` / `EditTool.tsx`：代码区域改用 CodeBlock
  - `GlobTool.tsx`：文件列表改用 FileTree + `parseGlobToTree()`
  - `GrepTool.tsx` / `WebSearchTool.tsx` / `WebFetchTool.tsx` / `TaskTool.tsx` / `TodoWriteTool.tsx` / `SkillTool.tsx` / `NotebookEditTool.tsx` / `KillShellTool.tsx`：改用 AI Elements Tool 通用组件
  - `CollapsibleTool.tsx`：替换为 AI Elements Tool 外壳
  - 更新 `toolBadgeConfig.tsx` 简化配置
  - 处理 partial parse fallback（inputJson 未解析完时显示 input-streaming 状态）
  - _需求：3_

- [x] 6. 迁移 MessageFeedback → FeedbackDialog
  - 将 thumbs up/down 按钮并入 Message 组件的 MessageActions
  - 重构 MessageFeedback.tsx 为 FeedbackDialog（保留负反馈原因枚举 + 评论 + analytics）
  - _需求：1_

- [x] 7. 迁移 AttachmentPreviewList → AI Elements Attachments
  - 替换 `AttachmentPreviewList.tsx` 使用 AI Elements Attachments 组件
  - 处理三种附件形态（发送前 blob URL、发送后 file:// URL、历史回放 metadata fallback）
  - _需求：1_

- [x] 8. 迁移 ChatInput → PromptInput
  - 替换 `ChatInput.tsx` 使用 AI Elements PromptInput
  - 集成 ModelSelector（支持自定义模型）
  - 集成 SlashCommandMenu（使用 PromptInputCommand 或保留现有）
  - 处理：空文本+有附件的提交、Stop 按钮、文件大小验证
  - 将 floatingPanel 移到 Chat.tsx 层
  - _需求：4_

- [x] 9. 迁移 MessageList → Conversation + 虚拟滚动
  - 替换 `MessageList.tsx` 使用 AI Elements Conversation
  - 在 ConversationContent 内部保留 TanStack Virtual 虚拟化
  - 使用 ConversationScrollButton 替代自定义滚动按钮
  - 添加 ConversationEmptyState
  - _需求：5_

- [x] 10. 迁移 ArtifactPanel 代码高亮
  - 代码预览改用 AI Elements CodeBlock（移除手动 Shiki 调用）
  - DeliverableCard 改用 AI Elements Artifact 子组件
  - 保留 HTML iframe sandbox 和 Image preview 不变
  - 保留异步磁盘读取逻辑
  - _需求：6_

- [x] 11. 更新 Chat.tsx 页面骨架
  - 整合所有迁移后的组件
  - 移除不再需要的高度上报 / padding 计算逻辑
  - 确保拖拽上传、粘贴上传、自动保存等页面级功能正常
  - _需求：1-6_

- [x] 12. 清理 + 最终验证
  - 删除不再使用的 `tools/utils.tsx`（如 ToolHeader/MonoText 等已被取代）
  - 清理未使用的 import 和死代码
  - 运行完整验证：`bun run lint && bun run typecheck && bun run test && bun run build`
  - _需求：全部_
