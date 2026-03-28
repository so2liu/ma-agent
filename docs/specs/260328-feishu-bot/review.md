# 审查结论

## 已修复

1. 固定飞书会话可被删除，删除后会破坏固定会话恢复和后续消息持久化。
   - 修复：将 `isFeishu` 显式持久化到会话文件，后端拒绝删除飞书会话，前端隐藏删除入口。
   - 文件：`src/main/lib/conversation-db.ts`、`src/renderer/components/Sidebar.tsx`、`src/renderer/components/ChatHistoryDrawer.tsx`

2. 群聊消息只要 `mentions` 非空就会触发机器人，导致别人被 @ 时也会污染飞书固定上下文。
   - 修复：启动时读取飞书应用名称和多语言名称，仅在群聊中明确 @机器人名称时才处理消息。
   - 文件：`src/main/lib/feishu/feishu-bot.ts`

3. 飞书会话标记依赖运行时推断，存在误判普通会话或在配置变化后状态漂移的风险。
   - 修复：会话文件持久化 `isFeishu`，读取和列表展示优先使用持久化标记，旧数据仅作为兜底推断。
   - 文件：`src/main/lib/conversation-db.ts`

## 复查结果

- Bug：未发现新的阻断性问题。
- 安全：未发现本次 diff 新增的注入、XSS 或敏感信息泄露问题。
- 性能：未发现明显的新增热点或不必要的高频计算。
- TypeScript：`bun run typecheck` 通过。

## 验证

- `bun run lint`
- `bun run typecheck`
- `bun run test`
