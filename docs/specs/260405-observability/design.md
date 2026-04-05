# 技术设计：可观测性补全（已整合 Codex 审查）

## 架构概览

两个独立模块：
1. **PostHog 埋点补全** — 补 3 个缺失事件
2. **Sentry 错误上报** — 新增 `@sentry/electron`，覆盖 main + renderer

## 需求 1：补全 PostHog 埋点

### 已实现事件（无需修改）

| 事件 | 位置 |
|------|------|
| `message_sent` | Chat.tsx:555 |
| `message_completed` / `message_stopped` / `message_error` | chatStore.ts:646 |
| `message_feedback` | MessageFeedback.tsx |
| `conversation_created` | Chat.tsx:629 |
| `conversation_deleted` | Sidebar.tsx:215 |
| `model_switched` | Chat.tsx:983 |
| `attachment_added` | Chat.tsx:416 |
| `tool_used` | chatStore.ts:473 |
| `app_launched` / `app_closed` | index.ts:151/183 |

### 缺失事件（需补全）

| 事件 | 注入位置 | 属性 | 备注 |
|------|---------|------|------|
| `conversation_resumed` | Chat.tsx `handleLoadConversation()` 成功加载后 | - | 只在成功加载历史对话后触发 |
| `settings_changed` | Settings.tsx 各 save/toggle handler | settingKey | 不含 API key 等敏感值 |
| `skill_executed` | Chat.tsx `onSelectSkill` | skillName | 语义为"用户选择了技能"，当前可观测粒度 |

### 实现方式

- `conversation_resumed`：在 `handleLoadConversation()` 成功路径加一行 `track('conversation_resumed')`
- `settings_changed`：在 Settings.tsx 各 handler 成功保存后加 `track('settings_changed', { settingKey: '...' })`
- `skill_executed`：在 `onSelectSkill` 回调加 `track('skill_executed', { skillName: selectedCard.title })`

## 需求 2：Sentry 错误上报

### 技术选型

`@sentry/electron` — main 和 renderer 分别初始化。

### 关键设计决策（基于 Codex 审查修正）

1. **DSN 传递**：通过 preload bridge 暴露 DSN 到 renderer（不用 `window.__SENTRY_DSN__`，兼容 contextIsolation）
2. **隐私 gating**：main 侧 `beforeSend` 检查 `analyticsEnabled`；renderer 侧通过 `beforeSend` 从 preload 获取设置同样检查
3. **环境检测**：使用 `ELECTRON_RENDERER_URL` 是否存在来判断 dev/production，与项目现有方式一致
4. **空/无效 DSN**：DSN 为空时跳过初始化，不产生日志噪音
5. **Source map**：本期不做 source map 上传，后续按需添加

### 文件变更

| 文件 | 变更 |
|------|------|
| `package.json` | 添加 `@sentry/electron` 依赖 |
| `src/main/lib/sentry.ts` (**新增**) | Main Sentry 初始化 + flush |
| `src/main/index.ts` | 顶部 `initSentry()`，`will-quit` 中 `flushSentry()` |
| `src/renderer/lib/sentry.ts` (**新增**) | Renderer Sentry 初始化 |
| `src/renderer/main.tsx` | 顶部调用 renderer Sentry init |
| `src/preload/index.ts` | 新增 `sentry.getDsn()` 和 `sentry.getEnabled()` bridge |
| `src/renderer/electron.d.ts` | 补充 sentry 类型 |
| `electron.vite.config.ts` | 注入 `SENTRY_DSN` 到 main define |

### Main Process 初始化

```typescript
// src/main/lib/sentry.ts
import * as Sentry from '@sentry/electron/main';
import { app } from 'electron';
import { loadConfig } from './config';

const SENTRY_DSN = process.env.SENTRY_DSN ?? (typeof __SENTRY_DSN__ !== 'undefined' ? __SENTRY_DSN__ : '');
const isDev = !!process.env.ELECTRON_RENDERER_URL;

export function initSentry(): void {
  if (!SENTRY_DSN) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    release: app.getVersion(),
    environment: isDev ? 'development' : 'production',
    beforeSend(event) {
      const config = loadConfig() as Record<string, unknown>;
      if (config.analyticsEnabled === false) return null;
      return event;
    }
  });
}

export function getSentryDsn(): string { return SENTRY_DSN; }

export async function flushSentry(): Promise<void> {
  await Sentry.close(2000);
}
```

### Renderer Process 初始化

```typescript
// src/renderer/lib/sentry.ts
import * as Sentry from '@sentry/electron/renderer';

export function initSentryRenderer(): void {
  const dsn = window.electron.sentry.getDsn();
  const enabled = window.electron.sentry.getEnabled();
  if (!dsn || !enabled) return;
  Sentry.init({
    dsn,
    beforeSend(event) {
      if (!window.electron.sentry.getEnabled()) return null;
      return event;
    }
  });
}
```

### Preload Bridge

```typescript
sentry: {
  getDsn: () => ipcRenderer.sendSync('sentry:get-dsn'),
  getEnabled: () => ipcRenderer.sendSync('sentry:get-enabled')
}
```

使用 `sendSync` 因为 Sentry 需要在应用最早期同步初始化。

## 安全考虑

- DSN 为公开信息（只能写入不能读取）
- `settings_changed` 只记录 key，不记录 value
- 所有上报尊重 `analyticsEnabled` 开关
