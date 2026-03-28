# 需求文档：AI Elements 组件库迁移

## 简介

将 Chat 页面的 AI 交互组件全面迁移至 [AI Elements](https://elements.ai-sdk.dev) 组件库，提升 AI 对话界面的一致性和可维护性。保留现有数据流（useClaudeChat hook + pi-coding-agent），通过薄适配层对接 AI Elements 的 props 接口。

## 需求

### 需求 1 - 消息渲染迁移

**用户故事：** 作为开发者，我想要用 AI Elements 的 Message 组件替换自定义 Message.tsx，以获得更标准化的消息渲染体验（内置 markdown、action buttons、流式渲染）。

#### 验收标准

1. 当助手发送纯文本消息时，Message 组件应使用 AI Elements Message 渲染 GFM markdown 内容
2. 当用户发送带附件的消息时，Message 组件应使用 AI Elements Attachments 组件展示附件预览
3. 当助手消息包含 like/dislike 反馈时，应使用 AI Elements Message 内置的 action buttons 替代自定义 MessageFeedback.tsx
4. 当消息正在流式传输时，Message 组件应正确显示流式渲染效果

### 需求 2 - 思考过程展示迁移

**用户故事：** 作为用户，我想要看到更优雅的 AI 思考过程折叠/展开体验，替代当前的 BlockGroup 实现。

#### 验收标准

1. 当助手消息包含 thinking block 时，应使用 AI Elements Reasoning 组件展示，支持自动展开（流式中）和折叠（完成后）
2. 当有多个连续 thinking block 时，Reasoning 组件应正确聚合展示

### 需求 3 - 工具调用展示迁移（混合策略）

**用户故事：** 作为用户，我想要工具调用有更统一的视觉呈现，同时保留关键工具的定制化展示。

#### 验收标准

1. 当 Bash 工具执行时，输出区域应使用 AI Elements Terminal 组件渲染（支持 ANSI 颜色）
2. 当 Read/Write/Edit 等工具涉及代码内容时，应使用 AI Elements Code Block 组件渲染代码（Shiki 高亮）
3. 当 Glob 工具返回文件列表时，应使用 AI Elements File Tree 组件展示
4. 当其他工具（WebSearch、WebFetch、Task、Grep 等）执行时，应使用 AI Elements Tool 通用组件展示（JSON input/output + 状态 badge）
5. 所有工具调用应支持 4 种状态：streaming / pending / complete / error

### 需求 4 - 输入区域迁移

**用户故事：** 作为用户，我想要一个功能更丰富的输入区域，替代当前的 ChatInput 实现。

#### 验收标准

1. 输入区域应使用 AI Elements Prompt Input 组件，支持自动调整高度
2. 当用户拖放或选择文件时，应使用 AI Elements 内置的文件上传功能展示附件
3. 模型选择器应使用 AI Elements Model Selector 组件替代当前的自定义实现
4. 当用户输入 `/` 时，应触发命令面板（如 Prompt Input 内置支持，否则保留 SlashCommandMenu）

### 需求 5 - 消息列表容器迁移

**用户故事：** 作为用户，我想要消息列表有更好的滚动体验和空状态展示。

#### 验收标准

1. 消息列表容器应使用 AI Elements Conversation 组件，支持自动滚动和 scroll-to-bottom 按钮
2. 当对话为空时，应展示合适的空状态界面
3. 性能不应明显退化（当前使用 TanStack Virtual 虚拟滚动，需评估 AI Elements 的滚动性能是否足够）

### 需求 6 - Artifact 预览迁移

**用户故事：** 作为用户，我想要产物预览面板使用 AI Elements 的标准化组件。

#### 验收标准

1. 代码产物应使用 AI Elements Code Block 组件渲染（Shiki 高亮、行号、复制按钮）
2. DeliverableCard 应使用 AI Elements Artifact 组件替代
3. HTML 预览功能应保留（使用 AI Elements Web Preview 或保留现有实现）

### 需求 7 - 薄适配层

**用户故事：** 作为开发者，我想要一个清晰的适配层，将现有 useClaudeChat 的数据类型映射到 AI Elements 期望的 props，而不需要重写数据流。

#### 验收标准

1. 应创建类型映射工具函数，将 Message/ContentBlock 类型转换为 AI Elements 组件的 props
2. 适配层应保持薄且可维护，不引入额外的状态管理
3. 现有的 IPC 协议和 useClaudeChat hook 不应被修改

## 范围排除

- **不迁移**：Sidebar、Settings 页、OnboardingWizard、DbViewer、ExcalidrawCanvas、SchedulesPage
- **不引入** Vercel AI SDK 或重写数据流
- **不修改** `src/renderer/components/ui/` 下的 shadcn/ui 组件
- **不修改** main process 或 preload 层代码
