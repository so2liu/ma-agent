# 实施计划

- [x] 1. 安装飞书 SDK 并添加类型定义
  - 安装 `@larksuiteoapi/node-sdk`
  - 创建 `src/main/lib/feishu/types.ts`，定义 FeishuConfig、消息事件等类型
  - _需求：需求 1、需求 5_

- [x] 2. 扩展配置系统
  - 在 `AppConfig` 中添加 `feishu?: FeishuConfig` 字段
  - 添加 `getFeishuConfig()` / `setFeishuConfig()` 函数
  - _需求：需求 5_

- [x] 3. 实现消息转换器
  - 创建 `src/main/lib/feishu/message-converter.ts`
  - 实现 text、post、image、file、media、share_chat、share_user、merge_forward、location 消息类型的转换
  - 实现 @mention 替换、文本转义（XML + Markdown）
  - 实现引用消息获取和格式化
  - 实现附件下载（含 sanitizeFileName + macOS 重名处理）
  - _需求：需求 2_

- [x] 4. 实现回复发送器
  - 创建 `src/main/lib/feishu/feishu-reply.ts`
  - 实现 Reaction 添加/移除（best-effort）
  - 实现回复消息（引用原消息 + 分段发送）
  - 实现错误消息发送
  - _需求：需求 3_

- [x] 5. 实现 FeishuBot 核心模块
  - 创建 `src/main/lib/feishu/feishu-bot.ts`
  - 实现 WSClient 生命周期管理（start/stop）
  - 实现消息串行队列（防止并发串流）
  - 实现事件去重
  - 实现消息来源过滤（忽略 bot 消息、区分私聊/群聊）
  - 实现 API Key 校验
  - 集成 message-converter 和 feishu-reply
  - 集成 SessionManager + AgentRuntime
  - 实现会话持久化（conversation-db 读写 + sessionId 恢复）
  - _需求：需求 1、需求 2、需求 3、需求 4_

- [x] 6. 注册 IPC handlers 并集成到主进程
  - 创建 `src/main/handlers/feishu-handlers.ts`（get-config、set-config、get-status、start、stop）
  - 修改 `src/main/index.ts`：注册 handlers、ensureWorkspaceDir 后自动启动、will-quit 时关闭
  - 修改 `src/preload/index.ts`：暴露 feishu:* IPC 通道
  - 修改 `src/renderer/electron.d.ts`：添加 feishu IPC 类型
  - _需求：需求 5_

- [x] 7. 实现设置页 UI
  - 创建 `src/renderer/components/settings/FeishuSettings.tsx`
  - 修改 `src/renderer/pages/Settings.tsx`：添加飞书设置导航项
  - 包含 App ID、App Secret 输入、启用开关、连接状态显示
  - _需求：需求 5_

- [x] 8. 桌面端飞书会话只读处理
  - 修改会话列表/聊天页，识别飞书会话并禁用输入
  - 飞书会话可查看历史但不能发送新消息
  - _需求：需求 4_
