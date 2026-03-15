# 实施计划

- [x] 1. 类型层变更 (`src/shared/types/ipc.ts`)
  - 新增 `LlmProvider = 'anthropic' | 'openai'` 类型
  - 将 `AgentProvider` 改为 `'claude-sdk' | 'pi'`
  - `AutoDetectResult.provider` 和 `ProbeDetail.provider` 改为 `LlmProvider`
  - _需求：需求 3_

- [x] 2. 配置层兼容映射 (`src/main/lib/config.ts`)
  - `getAgentProvider()` 添加旧值兼容映射 (`'anthropic' → 'claude-sdk'`, `'openai' → 'pi'`)
  - `setAgentProvider()` 确保写入新值
  - _需求：需求 3_

- [x] 3. Pi Agent 运行时增强 (`src/main/lib/openai-session.ts`)
  - `resolveModel()` 增加 Anthropic provider 查找 + 自定义 base URL 继承
  - `sendOpenAIMessage()` 根据 model.provider 选择 API key（Anthropic 或 OpenAI）
  - 新增 `getPiModelForPreference()` 支持 per-tier 模型解析
  - 检测 model preference 变更时重建会话
  - _需求：需求 1_

- [x] 4. Chat handler 适配 (`src/main/handlers/chat-handlers.ts`)
  - API key 预校验改为 model-aware（Pi 路径先 resolve model 再检查对应 key）
  - provider 值从 `'openai'` 改为 `'pi'`
  - _需求：需求 1, 需求 3_

- [x] 5. Config handler 适配 (`src/main/handlers/config-handlers.ts`)
  - `AutoDetectResult`/`ProbeDetail` 的 provider 字段改为 `LlmProvider`
  - auto-detect 结果不再直接 setAgentProvider，改为返回 `LlmProvider` 让 UI 映射
  - 其它 handler 中的 `AgentProvider` 引用更新
  - _需求：需求 2, 需求 3_

- [x] 6. IPC 桥接层更新 (`src/preload/index.ts`, `src/renderer/electron.d.ts`)
  - `AgentProvider` 类型引用更新
  - 新增 `LlmProvider` 导出/引用
  - _需求：需求 3_

- [x] 7. Settings UI 更新 (`src/renderer/pages/Settings.tsx`)
  - 运行时选择器改为 'Claude SDK' / 'Pi Agent'
  - Pi Agent 模式下允许配置 Anthropic key + Anthropic 模型
  - auto-detect 结果映射为运行时推荐
  - 添加 Claude SDK + 代理模式的引导说明文字
  - _需求：需求 1, 需求 2, 需求 3_

- [x] 8. Lint + Typecheck + Test
  - 运行 `bun run lint && bun run typecheck && bun run test`
  - 修复所有错误
  - _需求：所有_
