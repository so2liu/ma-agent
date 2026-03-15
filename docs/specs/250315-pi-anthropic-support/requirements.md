# 需求文档：跨 Provider 模型支持

## 简介

当前应用有两个 agent 运行时：Claude Agent SDK（子进程模式）和 pi-coding-agent（in-process）。两者各自只支持一种 API provider（Anthropic / OpenAI）。本需求要求打通 provider 限制，让两个运行时都能使用对方的 API，并提供简洁友好的配置体验。

## 需求

### 需求 1 - pi-coding-agent 支持 Anthropic API

**用户故事：** 作为拥有 Anthropic API key 的用户，我想要在 pi-coding-agent 运行时中使用 Claude 模型，以便获得 in-process 运行的轻量体验。

#### 验收标准

1. 当用户选择 Pi Agent 运行时，如果配置了 Anthropic API key 和 Claude 模型 ID，那么系统应该通过 pi-ai 的 Anthropic provider 正确发送请求并流式返回结果
2. 当用户选择 Pi Agent 运行时，如果同时配置了 OpenAI 和 Anthropic API key，那么系统应该根据所选模型 ID 自动判断使用哪个 provider 的 key
3. 当 Pi Agent 运行时使用 Anthropic 模型时，thinking（思考过程）和 tool use 功能应该正常工作

### 需求 2 - Claude Agent SDK 支持 OpenAI 兼容 API（通过代理）

**用户故事：** 作为拥有 OpenAI API key 的用户，我想要在 Claude SDK 运行时中使用 OpenAI 模型，以便获得 Claude SDK 的完整功能（resume、skills、message queue 等）。

#### 验收标准

1. 当用户选择 Claude SDK 运行时并配置了 OpenAI 兼容的 API，那么系统应该通过 `ANTHROPIC_BASE_URL` 代理机制将请求转发到 OpenAI 兼容端点
2. 系统应该在设置页面提供清晰的引导说明，告诉用户如何配置代理（如 LiteLLM）来实现此功能
3. 当用户通过智能配置（粘贴 API key）自动检测到 OpenAI key 时，系统应该提示用户可以通过代理在 Claude SDK 运行时中使用

### 需求 3 - 统一的 Provider 选择体验

**用户故事：** 作为非技术用户，我想要一个简单的配置流程，粘贴 API key 后系统自动完成配置，以便不需要理解运行时和 provider 的技术概念。

#### 验收标准

1. 当用户粘贴 API key 时，系统应该自动检测是 Anthropic 还是 OpenAI key，并自动选择合适的运行时和默认模型
2. 系统应该提供高级模式，允许用户手动选择运行时（Claude SDK / Pi Agent）和模型 provider
3. 当用户选择 Pi Agent 运行时，设置页面应该允许配置 Anthropic 或 OpenAI 的 API key/base URL/模型
4. Provider 选择 UI 应该从 `'anthropic' | 'openai'` 改为 `'claude-sdk' | 'pi'`，使语义更清晰
