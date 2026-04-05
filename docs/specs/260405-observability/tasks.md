# 实施计划

- [x] 1. 补全 PostHog 缺失埋点（conversation_resumed、settings_changed、skill_executed）
  - Chat.tsx: handleLoadConversation() 成功后加 track('conversation_resumed')
  - Settings.tsx: 各 save/toggle handler 成功后加 track('settings_changed', { settingKey })
  - Chat.tsx: onSelectSkill 回调加 track('skill_executed', { skillName })
  - _需求：需求 1_

- [x] 2. 安装 @sentry/electron 依赖
  - 运行 bun add @sentry/electron
  - _需求：需求 2_

- [x] 3. 实现 Sentry main process 初始化
  - 新增 src/main/lib/sentry.ts
  - 在 src/main/index.ts 顶部调用 initSentry()
  - 在 will-quit handler 中调用 flushSentry()
  - 在 electron.vite.config.ts 注入 SENTRY_DSN define
  - _需求：需求 2_

- [x] 4. 实现 Sentry renderer process 初始化 + preload bridge
  - 新增 src/renderer/lib/sentry.ts
  - 在 src/renderer/main.tsx 顶部调用 initSentryRenderer()
  - 在 src/preload/index.ts 添加 sentry bridge（getDsn, getEnabled）
  - 在 src/renderer/electron.d.ts 补充 sentry 类型
  - 注册 IPC handlers（sentry:get-dsn, sentry:get-enabled）
  - _需求：需求 2_
