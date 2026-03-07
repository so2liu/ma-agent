# 数据埋点采集方案调研

## 一、需求分析

| 需求              | 说明                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| 功能使用频率      | 统计用户对各功能的使用次数（发消息、切模型、用附件、创建/删除对话等） |
| 回复反馈（踩/赞） | 用户对 AI 回复不满意时点踩，满意时点赞                                |
| AI 脱敏上报       | 点踩后，将对话内容通过 AI 去除隐私信息，再上报到后端                  |

---

## 二、整体架构设计

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer (React)                                           │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ 👍👎 UI  │  │ track() 调用  │  │ useAnalytics hook  │    │
│  └────┬─────┘  └──────┬───────┘  └────────┬───────────┘    │
│       │               │                    │                │
│       └───────────────┴────────────────────┘                │
│                        │ IPC                                │
├────────────────────────┼────────────────────────────────────┤
│  Main Process          │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────┐                        │
│  │  analytics-handler.ts           │                        │
│  │  - 接收事件                      │                        │
│  │  - 本地缓存 (batch)              │                        │
│  │  - 定时上报                      │                        │
│  └──────────┬──────────────────────┘                        │
│             │                                               │
│  ┌──────────▼──────────────────────┐                        │
│  │  privacy-sanitizer.ts           │                        │
│  │  - 调用 Claude API 脱敏          │                        │
│  │  - 正则预处理（邮箱、手机号等）    │                        │
│  └──────────┬──────────────────────┘                        │
│             │                                               │
│  ┌──────────▼──────────────────────┐                        │
│  │  analytics-transport.ts         │                        │
│  │  - HTTP 上报到后端               │                        │
│  │  - 失败重试 + 离线缓存           │                        │
│  └─────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、IPC 协议设计

遵循现有 `namespace:action` 命名规范，新增 `analytics:*` 命名空间：

```typescript
// 新增 IPC 通道
'analytics:track-event'; // 上报通用埋点事件
'analytics:submit-feedback'; // 上报消息反馈（赞/踩 + 可选原因）
'analytics:get-settings'; // 获取埋点开关（用户可关闭）
'analytics:set-settings'; // 设置埋点开关
```

### 事件类型定义 (`src/shared/types/analytics.ts`)

```typescript
/** 埋点事件类型 */
type AnalyticsEventType =
  // 对话相关
  | 'message_sent' // 发送消息
  | 'message_completed' // 收到完整回复
  | 'message_stopped' // 用户中断回复
  | 'message_error' // 回复出错
  // 反馈相关
  | 'message_feedback' // 对消息点赞/点踩
  // 会话相关
  | 'conversation_created' // 新建对话
  | 'conversation_deleted' // 删除对话
  | 'conversation_resumed' // 恢复对话
  // 功能使用
  | 'model_switched' // 切换模型
  | 'attachment_added' // 添加附件
  | 'artifact_viewed' // 查看 artifact
  | 'tool_used' // 工具被调用
  | 'skill_executed' // Skill 被执行
  // 应用生命周期
  | 'app_launched' // 应用启动
  | 'app_closed' // 应用关闭
  | 'app_error' // 应用级错误
  | 'settings_changed' // 修改设置
  | 'update_installed' // 更新已安装
  | 'workspace_changed'; // 工作目录变更

/** 通用埋点事件 */
interface AnalyticsEvent {
  type: AnalyticsEventType;
  timestamp: number;
  sessionId?: string; // 可选，SDK session 建立前为空
  anonymousId: string; // 必填，首次启动生成并持久化到 config.anonymousId 中
  properties?: Record<string, string | number | boolean>;
}

/** 消息反馈 */
interface MessageFeedback {
  messageId: string;
  conversationId?: string; // 可选，首条消息自动保存前可能为空
  rating: 'positive' | 'negative';
  reason?: string; // 用户选择的原因标签
  comment?: string; // 用户自由输入的补充
  // 以下字段仅在用户同意上报对话内容时填充，会经过 AI 脱敏
  sanitizedUserMessage?: string;
  sanitizedAssistantMessage?: string;
}

/** 埋点设置 */
interface AnalyticsSettings {
  enabled: boolean; // 总开关
  shareConversationOnFeedback: boolean; // 反馈时是否上报脱敏后的对话内容
}
```

---

## 四、核心模块实现方案

### 4.1 Renderer 端：反馈 UI + 埋点 Hook

#### 反馈按钮组件 (`src/renderer/components/MessageFeedback.tsx`)

在 assistant 消息底部添加 👍👎 按钮，点踩时弹出原因选择：

```tsx
// 踩的原因选项
const NEGATIVE_REASONS = [
  { id: 'incorrect', label: '回答不正确' },
  { id: 'incomplete', label: '回答不完整' },
  { id: 'irrelevant', label: '没有回答我的问题' },
  { id: 'too_slow', label: '响应太慢' },
  { id: 'tool_error', label: '工具调用出错' },
  { id: 'other', label: '其他' }
];
```

**交互流程：**

1. 点赞 → 直接上报 `{ rating: 'positive' }`
2. 点踩 → 弹出浮层，选择原因 + 可选评论 → 上报
3. 如果用户开启了"反馈时分享对话内容"，在主进程调用 AI 脱敏后一并上报

#### 埋点 Hook (`src/renderer/hooks/useAnalytics.ts`)

```typescript
export function useAnalytics() {
  const track = useCallback(
    (type: AnalyticsEventType, properties?: Record<string, string | number | boolean>) => {
      window.electron.analytics.trackEvent({ type, timestamp: Date.now(), properties });
    },
    []
  );

  const submitFeedback = useCallback((feedback: MessageFeedback) => {
    window.electron.analytics.submitFeedback(feedback);
  }, []);

  return { track, submitFeedback };
}
```

**埋点注入位置：**

| 文件                                        | 事件                   | 说明                                     |
| ------------------------------------------- | ---------------------- | ---------------------------------------- |
| `Chat.tsx` → `handleSendMessage`            | `message_sent`         | 发送消息时，记录模型、是否有附件         |
| `useClaudeChat.ts` → `onMessageComplete`    | `message_completed`    | 收到完整回复                             |
| `useClaudeChat.ts` → `onMessageStopped`     | `message_stopped`      | 用户中断                                 |
| `useClaudeChat.ts` → `onMessageError`       | `message_error`        | 错误                                     |
| `ChatInput.tsx` → model selector            | `model_switched`       | 切换模型，记录 from/to                   |
| `ChatInput.tsx` → attachment handler        | `attachment_added`     | 添加附件，记录类型和大小                 |
| `useClaudeChat.ts` → `onToolUseStart`       | `tool_used`            | 工具调用开始时记录一次，避免渲染重复计数 |
| `useClaudeChat.ts` → conversation autosave  | `conversation_created` | 对话首次保存时触发，而非 UI 点击时       |
| `Sidebar.tsx` → delete handler (IPC 完成后) | `conversation_deleted` | 对话删除确认后                           |
| `Message.tsx` → 反馈按钮                    | `message_feedback`     | 赞/踩                                    |

### 4.2 Main 端：事件处理 + AI 脱敏 + 上报

#### 事件处理器 (`src/main/handlers/analytics-handlers.ts`)

```typescript
export function registerAnalyticsHandlers(): void {
  ipcMain.handle('analytics:track-event', async (_event, analyticsEvent: AnalyticsEvent) => {
    await analyticsService.trackEvent(analyticsEvent);
  });

  ipcMain.handle('analytics:submit-feedback', async (_event, feedback: MessageFeedback) => {
    // 如果用户开启了对话分享，主进程从 conversationId 加载原始消息并做 AI 脱敏
    // （Renderer 不发送原始对话内容，避免在 IPC 中传输敏感数据）
    if (analyticsSettings.shareConversationOnFeedback && feedback.conversationId) {
      feedback = await loadAndSanitizeConversation(feedback);
    }
    await analyticsService.submitFeedback(feedback);
  });
}
```

#### AI 脱敏模块 (`src/main/lib/privacy-sanitizer.ts`)

**两层脱敏策略：**

**第一层：正则预处理（快速、零成本）**

```typescript
const PATTERNS = [
  // 邮箱
  { regex: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, replacement: '[EMAIL]' },
  // 电话号码（中国手机、美国、国际格式）
  { regex: /\b1[3-9]\d{9}\b/g, replacement: '[PHONE]' },
  { regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE]' },
  { regex: /\+\d{1,3}[-.\s]?\d{4,14}/g, replacement: '[PHONE]' },
  // IP 地址
  { regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP]' },
  // 中国身份证号
  { regex: /\b\d{17}[\dXx]\b/g, replacement: '[ID_NUMBER]' },
  // 信用卡号（16 位数字，可带分隔符）
  { regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[CARD_NUMBER]' },
  // 各类 API Key
  { regex: /sk-[a-zA-Z0-9]{20,}/g, replacement: '[API_KEY]' },
  { regex: /AKIA[0-9A-Z]{16}/g, replacement: '[API_KEY]' },
  { regex: /ghp_[a-zA-Z0-9]{36,}/g, replacement: '[API_KEY]' },
  { regex: /gho_[a-zA-Z0-9]{36,}/g, replacement: '[API_KEY]' },
  // URL 中的凭据
  { regex: /https?:\/\/[^:]+:[^@]+@/g, replacement: 'https://[CREDENTIALS]@' },
  // 证书
  { regex: /-----BEGIN[A-Z ]+-----[\s\S]+?-----END[A-Z ]+-----/g, replacement: '[CERTIFICATE]' },
  // 文件路径中的用户名
  { regex: /\/Users\/[^/\s]+/g, replacement: '/Users/[USER]' },
  { regex: /\/home\/[^/\s]+/g, replacement: '/home/[USER]' },
  { regex: /C:\\Users\\[^\\\s]+/g, replacement: 'C:\\Users\\[USER]' }
];

function regexSanitize(text: string): string {
  let result = text;
  for (const { regex, replacement } of PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}
```

**第二层：AI 深度脱敏（语义级别）**

> **[!WARNING] 隐私与成本风险**
> AI 脱敏需要将正则预处理后的文本发送到 Anthropic API，语义级隐私（人名、公司名）仍会以明文形式经过外部 API。
> 实现时必须：
>
> 1. 在 UI 上明确告知用户"脱敏过程需要调用 AI 服务"
> 2. 每次反馈前弹出确认对话框，展示将要发送的内容预览
> 3. 使用项目内置 API key（而非用户的 key）以避免额外计费
> 4. 对发送内容施加 token 上限（最多 4096 tokens），避免长对话产生高费用
> 5. 长期方案：考虑使用本地模型（如 ONNX Runtime + 小型 NER 模型）完全消除外部 API 依赖
> 6. AI 脱敏失败时，不得回退到仅正则脱敏后直接上报，应丢弃此次反馈内容并通知用户

```typescript
// TODO: 使用项目内置 API key，需在后端实现代理以避免 key 暴露
async function aiSanitize(text: string): Promise<string> {
  // 限制输入长度，避免长对话产生高额费用
  const truncated = text.slice(0, 8000);
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', // 用最便宜的模型
    max_tokens: 2048,
    system: `你是一个隐私数据脱敏专家。请将以下文本中的所有个人隐私信息替换为占位符，包括但不限于：
- 人名 → [NAME]
- 公司名 → [COMPANY]
- 地址 → [ADDRESS]
- 邮箱 → [EMAIL]
- 电话 → [PHONE]
- 身份证号 → [ID_NUMBER]
- 银行卡号 → [CARD_NUMBER]
- API密钥/密码 → [SECRET]
- 文件路径中的用户名 → [USER]
- 其他可识别个人身份的信息

保留技术内容（代码、错误信息、工具名称等），只替换隐私信息。
直接返回脱敏后的文本，不要添加任何说明。`,
    messages: [{ role: 'user', content: text }]
  });
  return response.content[0].type === 'text' ? response.content[0].text : text;
}

/** 组合脱敏：先正则后 AI。AI 失败时不回退，抛出错误 */
export async function sanitize(text: string): Promise<string> {
  const regexResult = regexSanitize(truncated);
  // AI 脱敏失败时抛出错误，调用方应捕获并通知用户脱敏失败，不上报对话内容
  return aiSanitize(regexResult);
}
```

**为什么分两层：**

- 正则层：捕获格式化的敏感数据（邮箱、手机号、API Key），速度快、零成本
- AI 层：捕获语义级别的隐私（人名、公司名、地址），正则难以覆盖
- 正则先行可以减少 AI 需要处理的敏感数据量，降低泄漏风险

#### 上报传输层 (`src/main/lib/analytics-transport.ts`)

```typescript
class AnalyticsTransport {
  private buffer: AnalyticsEvent[] = [];
  private readonly BATCH_SIZE = 20;
  private readonly FLUSH_INTERVAL = 30_000; // 30秒
  private readonly MAX_RETRIES = 3;
  // TODO: 替换为实际的 analytics 服务端点，应从环境变量或配置文件读取
  private readonly ENDPOINT =
    process.env.ANALYTICS_ENDPOINT ?? 'https://your-analytics-server.com/v1/events';

  constructor() {
    // 定时 flush
    setInterval(() => this.flush(), this.FLUSH_INTERVAL);
    // 应用退出时同步 flush，确保 app_closed 和最后一批事件不丢失
    app.on('before-quit', () => {
      this.flushSync();
    });
  }

  /** 同步写入本地队列（用于 before-quit，不做网络请求） */
  private flushSync(): void {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    this.persistToLocalQueueSync(batch);
  }

  async push(event: AnalyticsEvent): Promise<void> {
    this.buffer.push(event);
    if (this.buffer.length >= this.BATCH_SIZE) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.BATCH_SIZE);
    try {
      await this.send(batch);
    } catch {
      // 失败则写入本地文件，下次启动时重试
      await this.persistToLocalQueue(batch);
    }
  }

  private async send(events: AnalyticsEvent[], retries = 0): Promise<void> {
    const res = await fetch(this.ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, appVersion: app.getVersion() })
    });

    if (!res.ok) {
      if (retries < this.MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2 ** retries * 1000));
        return this.send(events, retries + 1);
      }
      // 重试耗尽仍失败，写入本地队列而非丢弃
      throw new Error(`Analytics send failed after ${this.MAX_RETRIES} retries: ${res.status}`);
    }
  }

  /** 离线时缓存到本地文件 */
  private async persistToLocalQueue(events: AnalyticsEvent[]): Promise<void> {
    // 写入 ~/.config/Claude Agent Desktop/analytics-queue.json
  }

  /** 应用启动时重发离线队列 */
  async drainLocalQueue(): Promise<void> {
    // 读取并清空 analytics-queue.json，逐批上报
  }
}
```

---

## 五、后端方案选型对比

| 方案                      | 优点                                       | 缺点                         | 推荐场景           |
| ------------------------- | ------------------------------------------ | ---------------------------- | ------------------ |
| **自建后端 + ClickHouse** | 完全控制数据、无第三方依赖、查询灵活       | 需要运维、需要开发 Dashboard | 数据敏感、长期使用 |
| **PostHog (自部署)**      | 开源、功能全（事件分析+漏斗+留存）、有 SDK | 自部署需资源、学习成本       | 中小团队、快速启动 |
| **PostHog (Cloud)**       | 免运维、慷慨免费额度(100万事件/月)         | 数据在第三方                 | 快速验证           |
| **Mixpanel**              | 成熟的分析平台、丰富的可视化               | 免费额度较少、数据在第三方   | 产品分析为主       |
| **仅本地 SQLite**         | 零成本、完全离线、无隐私顾虑               | 无法跨设备聚合、无远程分析   | 个人使用/开发阶段  |

**推荐：PostHog 自部署或 Cloud** — 开源、Node.js SDK 成熟、支持 Electron 环境、免费额度足够。

---

## 六、隐私与合规

### 用户控制

在 Settings 页面新增"数据与隐私"区域：

```
┌────────────────────────────────────────────────┐
│  数据与隐私                                      │
│                                                  │
│  [ ] 发送匿名使用统计（默认关闭）                   │
│      帮助我们改进产品，仅收集功能使用频率            │
│                                                  │
│  [ ] 反馈时分享脱敏后的对话内容（默认关闭）          │
│      点踩时，AI 会先去除隐私信息再上报对话内容       │
│      注意：脱敏过程需调用 AI 服务                   │
│                                                  │
│  [查看已收集的数据]  [清除本地数据]                  │
└────────────────────────────────────────────────┘
```

> 注意：两个选项默认均为关闭状态（Opt-in），首次启动时弹窗提示用户选择。

### 关键原则

1. **Opt-in**：首次启动弹窗征求用户同意，默认关闭
2. **透明**：用户可查看已收集的数据和将要上报的内容
3. **最小化**：只收集必要的事件，不收集完整对话内容（除非用户主动反馈）
4. **可删除**：用户可随时清除本地已缓存的数据
5. **脱敏优先**：反馈对话内容必须经过两层脱敏处理

### 不收集的数据

- 完整对话内容（除非用户主动通过反馈提交）
- API Key
- 文件内容
- 系统环境信息（除 OS 类型和 app 版本）

---

## 七、实现路径（分阶段）

### Phase 1：基础埋点框架（~2天）

新增文件：

- `src/shared/types/analytics.ts` — 类型定义
- `src/main/lib/analytics-service.ts` — 事件收集服务
- `src/main/lib/analytics-transport.ts` — 上报传输层
- `src/main/handlers/analytics-handlers.ts` — IPC 处理器
- `src/renderer/hooks/useAnalytics.ts` — 前端埋点 Hook

修改文件：

- `src/preload/index.ts` — 新增 `analytics` IPC bridge
- `src/renderer/electron.d.ts` — 新增类型
- `src/main/index.ts` — 注册 handler
- `src/main/lib/config.ts` — 新增 analytics settings

### Phase 2：反馈 UI（~1天）

新增文件：

- `src/renderer/components/MessageFeedback.tsx` — 👍👎 组件
- `src/renderer/components/FeedbackModal.tsx` — 踩的原因浮层

修改文件：

- `src/renderer/components/Message.tsx` — 在 assistant 消息底部渲染反馈按钮

### Phase 3：Settings UI + 合规（~0.5天）

修改文件：

- `src/renderer/pages/Settings.tsx` — 新增隐私设置区域

### Phase 4：后端对接 + Dashboard（独立工作）

- 搭建 PostHog 或自建后端
- 配置事件分析 Dashboard
- 设置报警规则
- 实现 analytics API 代理（为 Phase 5 AI 脱敏提供项目内置 API key）

### Phase 5：AI 脱敏（~1天，依赖 Phase 4 后端代理）

新增文件：

- `src/main/lib/privacy-sanitizer.ts` — 正则 + AI 脱敏

修改文件：

- `src/main/handlers/analytics-handlers.ts` — 接入脱敏流程

> 注意：AI 脱敏依赖 Phase 4 搭建的后端代理来提供项目内置 API key，
> 不能使用用户的 API key。Phase 4 完成前，反馈功能仅收集评分和原因，
> 不收集对话内容。

---

## 八、代码变更总览

```
新增 6 个文件：
  src/shared/types/analytics.ts
  src/main/lib/analytics-service.ts
  src/main/lib/analytics-transport.ts
  src/main/lib/privacy-sanitizer.ts
  src/main/handlers/analytics-handlers.ts
  src/renderer/hooks/useAnalytics.ts
  src/renderer/components/MessageFeedback.tsx

修改 7 个文件：
  src/preload/index.ts          (+15 行)
  src/renderer/electron.d.ts    (+10 行)
  src/main/index.ts             (+2 行)
  src/main/lib/config.ts        (+10 行)
  src/renderer/components/Message.tsx  (+5 行)
  src/renderer/pages/Chat.tsx   (+10 行，注入 track 调用)
  src/renderer/pages/Settings.tsx (+30 行，隐私设置 UI)
```

---

## 九、关键设计决策总结

| 决策         | 选择                 | 理由                                          |
| ------------ | -------------------- | --------------------------------------------- |
| 埋点触发位置 | Renderer + Main 两层 | UI 交互在 Renderer 追踪，系统事件在 Main 追踪 |
| 脱敏策略     | 正则 + AI 两层       | 正则快速去格式化数据，AI 去语义级隐私         |
| 脱敏模型     | Haiku                | 最便宜，脱敏任务不需要强推理                  |
| 上报策略     | 批量 + 定时          | 减少网络请求，30秒或20条触发                  |
| 离线处理     | 本地文件队列         | 应用重启后重试上报                            |
| 用户控制     | Opt-in + 独立开关    | 尊重隐私，合规要求                            |
| 反馈 UI      | 内联 👍👎 + 弹窗详情 | 低摩擦的反馈入口                              |
