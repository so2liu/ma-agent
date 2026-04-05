# 需求文档：可观测性补全（埋点 + 错误上报）

## 简介

当前项目的 PostHog 用户行为埋点框架已搭建（约 60%），但多个关键事件缺少注入点。程序错误上报完全缺失（0%）。本需求补全这两部分，使产品具备基础的可观测性能力。

## 现状

### 已实现
- PostHog 核心框架：`analytics-service.ts`、IPC 通道、类型定义、Settings 开关
- 已有埋点：`app_launched`、`app_closed`、`tool_used`、`message_completed`/`message_stopped`、`message_feedback`
- PostHog 配置：EU 端点，支持环境变量覆盖

### 缺失
- 多个事件未注入：`message_sent`、`model_switched`、`attachment_added`、`conversation_created`、`conversation_deleted`、`settings_changed`、`skill_executed`、`message_error`、`conversation_resumed`
- 错误上报：无 Sentry 或同类服务，无全局错误捕获

## 需求

### 需求 1 - 补全 PostHog 埋点注入点

**用户故事：** 作为产品运营者，我想要完整的用户行为数据，以便分析功能使用情况和优化产品体验

#### 验收标准

1. 当用户发送消息时，系统应该触发 `message_sent` 事件，包含消息长度、附件数量、当前模型等属性
2. 当用户切换模型时，系统应该触发 `model_switched` 事件，包含切换前后的模型名称
3. 当用户上传附件时，系统应该触发 `attachment_added` 事件，包含文件类型和大小
4. 当用户创建新对话时，系统应该触发 `conversation_created` 事件
5. 当用户删除对话时，系统应该触发 `conversation_deleted` 事件
6. 当用户修改设置时，系统应该触发 `settings_changed` 事件，包含变更的设置项（不含敏感值如 API key）
7. 当用户恢复历史对话时，系统应该触发 `conversation_resumed` 事件
8. 当消息流式传输出错时，系统应该触发 `message_error` 事件，包含错误类型
9. 当技能被执行时，系统应该触发 `skill_executed` 事件，包含技能名称
10. 所有埋点都应尊重用户的 `analyticsEnabled` 设置开关

### 需求 2 - 集成 Sentry 错误上报

**用户故事：** 作为开发者，我想要自动捕获和上报程序异常，以便及时发现和修复线上问题

#### 验收标准

1. 当 Main process 发生 uncaughtException 或 unhandledRejection 时，Sentry 应该捕获并上报
2. 当 Renderer process 发生未捕获的错误或 Promise rejection 时，Sentry 应该捕获并上报
3. Sentry 应该在应用启动时初始化，在应用关闭时正确 flush
4. Sentry 上报应包含应用版本号、平台信息、进程类型（main/renderer）等上下文
5. Sentry DSN 应支持通过环境变量 `SENTRY_DSN` 覆盖，方便本地开发
6. Sentry 应使用 Sentry 官方的 Electron SDK（`@sentry/electron`），它同时覆盖 main 和 renderer 进程
7. 当用户关闭 analytics 时，Sentry 也应停止上报（尊重用户隐私选择）
