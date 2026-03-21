# 需求文档：移除 Claude Agent SDK，统一使用 Pi-Agent

## 简介

将 ma-agent 的 agent runtime 从双 runtime 架构（Claude Agent SDK + pi-coding-agent）统一为单一 pi-coding-agent runtime。移除 `@anthropic-ai/claude-agent-sdk` 依赖，通过 pi-ai 的 Anthropic provider 继续支持 Claude 模型。同时去掉「provider 选择」概念，用户只需选择模型，runtime 自动路由。

## 需求

### 需求 1 - 移除 Claude Agent SDK 依赖

**用户故事：** 作为开发者，我想要移除 `@anthropic-ai/claude-agent-sdk` 依赖，以便减小安装包体积、降低维护复杂度，并获得对 agent runtime 的完全控制权。

#### 验收标准

1. 当应用构建完成后，`@anthropic-ai/claude-agent-sdk` 不再出现在 `package.json` 的 dependencies 中
2. 当应用运行时，所有原 Claude SDK 路径（claude-session.ts、schedule-executor.ts、chat-helpers.ts 中的 SDKUserMessage 等）均已替换为 pi-coding-agent 的等效实现
3. 当应用打包时，不再需要 `asarUnpack` 中的 `@anthropic-ai/claude-agent-sdk` 相关条目
4. 当应用运行在 Windows 上时，`buildClaudeSessionEnv()` 中 Claude Code 特有的环境变量（`CLAUDE_CODE_GIT_BASH_PATH`、`ELECTRON_RUN_AS_NODE`）不再需要设置

### 需求 2 - 统一 Agent Session 到 Pi-Agent

**用户故事：** 作为用户，我想要无论选择 Claude 还是 OpenAI 模型，都使用相同的 agent 引擎处理我的请求，以便获得一致的体验。

#### 验收标准

1. 当用户选择 Claude 模型（如 claude-sonnet-4-5）时，系统通过 pi-coding-agent + pi-ai Anthropic provider 执行请求
2. 当用户选择 OpenAI 模型（如 gpt-4.1）时，系统通过 pi-coding-agent + pi-ai OpenAI provider 执行请求
3. 当 agent 执行过程中，streaming（text、thinking、tool use）事件正常传递到 renderer
4. 当用户中断响应时，abort 机制正常工作
5. 当用户切换模型偏好（快速/均衡/强力）时，下一次请求使用新模型

### 需求 3 - 去掉 Provider 选择，只暴露模型选择

**用户故事：** 作为非技术用户，我只想选择我要用的模型（快速/均衡/强力），不想理解什么是 "provider" 或 "runtime"。

#### 验收标准

1. 当用户打开设置页面时，不再显示「Agent 运行时」选择区域（claude-sdk / pi 的切换）
2. 当用户配置 API key 时，只需填写 Anthropic API key 和/或 OpenAI API key，系统根据所选模型自动使用对应 key
3. 当配置文件中仍有旧的 `agentProvider` 字段时，系统忽略该字段，不影响正常运行（向后兼容旧配置）

### 需求 4 - Skills 迁移到 Pi-Agent 格式

**用户故事：** 作为用户，我希望原有的技能（docx、xlsx、pdf 等）在迁移后仍然可用。

#### 验收标准

1. 当应用启动时，内置 skills（docx、xlsx、pdf、excalidraw、frontend-design、web-app）通过 pi-agent 的 ResourceLoader 机制加载
2. 当 agent 执行时，skills 中定义的工具和提示词能被 agent 正确使用
3. 当用户安装自定义 skill 时，pi-agent 的 skills 发现机制能识别并加载

### 需求 5 - Session 持久化迁移到 JSONL

**用户故事：** 作为用户，我希望我的对话历史能被持久化保存，并支持恢复上下文继续对话。

#### 验收标准

1. 当用户发送消息时，session 数据通过 pi-agent 的 SessionManager 持久化为 JSONL 文件
2. 当用户重新打开一个已有对话时，系统能从 JSONL 文件恢复 session 上下文
3. 当用户在对话列表中查看历史对话时，现有的 conversation-db.ts 继续提供列表、搜索功能（conversation-db 管理元数据和展示，SessionManager 管理 agent session 状态）

### 需求 6 - 定时任务迁移

**用户故事：** 作为用户，我希望已配置的定时任务在迁移后继续正常执行。

#### 验收标准

1. 当定时任务触发时，系统使用 pi-coding-agent 的 `createAgentSession()` 执行任务
2. 当定时任务完成后，结果正常存储到 conversation-db
