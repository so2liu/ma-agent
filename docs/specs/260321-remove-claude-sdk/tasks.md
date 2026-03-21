# 实施计划

- [ ] 1. 创建 PiRuntime 实现
  - 新建 `src/main/lib/pi-runtime.ts`，实现 `AgentRuntime` 接口
  - 从 openai-session.ts 迁移核心逻辑：session 创建、事件映射、model 解析
  - 从 claude-session.ts 迁移 `SYSTEM_PROMPT_APPEND` 系统提示词
  - 使用 `createCodingTools(cwd)` 替代 `codingTools` 常量
  - 使用 `DefaultResourceLoader` 加载 skills（指向 `.claude/skills/`）
  - 使用 `SessionManager.create()` / `SessionManager.open()` 做 JSONL 持久化
  - 补齐缺失事件：`tool-input-delta`、`content-block-stop`、`session-updated`
  - 添加工具名大小写映射（pi lowercase → renderer PascalCase）
  - 导出 `getCurrentModelPreference` / `setChatModelPreference` / `resolveModel` / `getPiModelForPreference`
  - _需求：需求 1, 2, 4, 5_

- [ ] 2. 重构 session-manager.ts
  - 移除 `Query`、`SDKUserMessage` 类型导入
  - 移除 `AgentProvider` 字段和 `getAgentProvider` 引用
  - `ManagedSession` 改为持有 `AgentRuntime` 实例
  - 移除 `messageQueue`、`messageGenerator`、`shouldAbortGenerator` 等 Claude SDK 特有字段
  - 简化 `destroy()` 方法（通过 runtime.reset() 清理）
  - _需求：需求 1, 2_

- [ ] 3. 重构 chat-handlers.ts
  - 移除 claude-session.ts 和 openai-session.ts 的所有 import
  - 移除 `provider === 'pi'` / `provider === 'claude-sdk'` 分支
  - 统一通过 `session.runtime.sendMessage()` / `interrupt()` / `reset()` 调用
  - 将 `buildUserMessage`（SDK 格式）替换为 `buildPlainTextWithAttachments`（纯文本）
  - 更新 model preference 调用路径
  - _需求：需求 2, 3_

- [ ] 4. 重构 chat-helpers.ts
  - 移除 `SDKUserMessage` 类型导入
  - 移除 `buildUserMessage` 函数（不再需要 SDK 格式的消息构造）
  - 保留 `buildPlainTextWithAttachments`、`sanitizeFileName`、`resolveAttachmentPath`
  - _需求：需求 1_

- [ ] 5. 重构 schedule-executor.ts
  - 移除 Claude SDK 的 `query()` 和 `SDKUserMessage` 导入
  - 使用 `createAgentSession()` + `agentSession.prompt()` 执行定时任务
  - 使用 `createCodingTools(cwd)` 和 `AuthStorage`
  - 通过 `agentSession.subscribe()` 收集结果
  - _需求：需求 6_

- [ ] 6. 清理 config.ts
  - 移除 `getAgentProvider()` / `setAgentProvider()` 函数
  - 简化 `buildClaudeSessionEnv()`：移除 `CLAUDE_CODE_GIT_BASH_PATH`、`ELECTRON_RUN_AS_NODE`、MSYS2 相关变量
  - `AppConfig` 接口保留 `agentProvider` 字段但不再读写（旧配置兼容）
  - _需求：需求 1, 3_

- [ ] 7. 清理 shared/types/ipc.ts
  - 移除 `AgentProvider` 类型定义
  - 保留 `DEFAULT_OPENAI_MODEL_IDS`、`DEFAULT_OPENAI_MODEL_NAMES`（仍用于 OpenAI 模型默认值）
  - _需求：需求 3_

- [ ] 8. 替换 renderer SDK 类型
  - `src/renderer/types/chat.ts`：移除 `@anthropic-ai/claude-agent-sdk/sdk-tools` 导入
  - 定义本地 tool input 类型（BashInput、ReadInput 等）
  - _需求：需求 1_

- [ ] 9. 清理 Settings.tsx UI
  - 移除 Agent Provider 选择器区域
  - 移除 `agentProvider` state 和相关 useEffect / handler
  - 移除 `RUNTIME_LABELS`、`getRecommendedRuntime` 等辅助函数
  - 移除 provider 条件展示逻辑（info box、OpenAI config 条件渲染）
  - _需求：需求 3_

- [ ] 10. 清理 IPC 层
  - `src/preload/index.ts`：移除 `getAgentProvider` / `setAgentProvider` bridge
  - `src/renderer/electron.d.ts`：移除对应类型定义
  - `src/main/handlers/config-handlers.ts`：移除 `config:get-agent-provider` / `config:set-agent-provider` handlers
  - _需求：需求 3_

- [ ] 11. 删除旧文件并更新依赖
  - 删除 `src/main/lib/claude-session.ts`
  - 删除 `src/main/lib/openai-session.ts`
  - 删除 `src/main/lib/claude-session.test.ts`
  - 更新 `src/main/lib/session-manager.test.ts`
  - `package.json`：移除 `@anthropic-ai/claude-agent-sdk`，升级 `@mariozechner/pi-coding-agent`
  - `electron.vite.config.ts`：移除 `asarUnpack` 中的 SDK 条目
  - 更新 `src/main/handlers/schedule-handlers.ts` 和 `src/main/lib/scheduler.ts` 的 import 路径
  - _需求：需求 1_

- [ ] 12. 验证
  - `bun run typecheck` 通过
  - `bun run lint` 通过
  - `bun run test` 通过
  - _需求：全部_
