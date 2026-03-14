# 实施计划

- [ ] 1. 基础类型定义与依赖安装
  - 安装 `@excalidraw/excalidraw` 依赖
  - 创建 `src/shared/types/canvas.ts`：SimpleElement 类型、ElementColor 等
  - 在 `src/shared/file-extensions.ts` 注册 `.excalidraw` 扩展名
  - _需求：需求 1、需求 2_

- [ ] 2. 格式转换层
  - 创建 `src/main/lib/canvas-converter.ts`：简化格式 ↔ 中间格式（纯数据操作）
  - 创建 `src/renderer/lib/canvas-excalidraw-converter.ts`：中间格式 ↔ excalidraw 原生格式
  - 编写单元测试覆盖双向转换、颜色映射、arrow binding、label binding
  - _需求：需求 2、需求 3_

- [ ] 3. IPC 协议与画布文件管理
  - 创建 `src/main/handlers/canvas-handlers.ts`：canvas:* IPC 处理器
  - 创建 `src/main/lib/canvas-state.ts`：画布状态缓存
  - 在 `src/preload/index.ts` 添加 canvas:* bridge
  - 在 `src/renderer/electron.d.ts` 添加类型声明
  - 在 `src/main/index.ts` 注册 canvas handlers
  - _需求：需求 1、需求 4_

- [ ] 4. 右侧工作区多 Tab 改造
  - 创建 `src/renderer/components/WorkspacePanel.tsx`：多 tab 面板
  - 创建 `src/renderer/components/TabBar.tsx`：Tab 栏组件
  - 修改 `src/renderer/pages/Chat.tsx`：从单 artifact 改为多 tab 状态管理
  - 保持 ArtifactPanel 向后兼容（作为 tab 内容之一）
  - _需求：需求 1_

- [ ] 5. Excalidraw 画布组件
  - 创建 `src/renderer/components/ExcalidrawCanvas.tsx`：封装 Excalidraw React 组件
  - 实现加载/保存 .excalidraw 文件
  - 实现 onChange → debounced 自动保存
  - 实现从 IPC 接收 SDK 执行结果更新画布
  - 处理 electron.vite.config.ts 构建配置（excalidraw 打包）
  - _需求：需求 1、需求 4_

- [ ] 6. TS SDK 设计与实现
  - 创建 `.claude/skills/excalidraw/sdk/`：SDK 包
  - 实现 ExcalidrawSDK 类（createRectangle、createArrow 等）
  - 实现 ElementRef 类（update、delete）
  - 实现 commit() → stdout JSON 输出
  - 编写单元测试
  - _需求：需求 2_

- [ ] 7. SDK 执行器
  - 创建 `src/main/lib/sdk-runner.ts`：bun 子进程管理
  - 实现类型校验（tsc）→ 执行 → 解析输出 → IPC 通知流程
  - 实现超时（30s）和输出大小限制（5MB）
  - _需求：需求 2_

- [ ] 8. CLI 工具
  - 创建 `.claude/skills/excalidraw/scripts/excalidraw-cli.ts`
  - 实现 `read` 命令：读取 .excalidraw → 简化格式 JSON
  - 通过 `bun --compile` 编译为独立二进制
  - _需求：需求 3_

- [ ] 9. 双向同步 - 画布变更附件
  - 创建 `src/renderer/hooks/useCanvasChanges.ts`：变更检测
  - 创建 `src/renderer/components/CanvasChangeAttachment.tsx`：附件卡片
  - 修改 `src/renderer/components/ChatInput.tsx`：展示画布变更附件
  - 实现发送消息时附带变更摘要
  - _需求：需求 4_

- [ ] 10. Built-in Skill 集成
  - 创建 `.claude/skills/excalidraw/manifest.json`
  - 创建 `.claude/skills/excalidraw/SKILL.md`：SDK 类型定义 + 使用示例 + CLI 参考
  - 添加 `.builtin` 标记文件
  - _需求：需求 5_

- [ ] 11. 聊天界面折叠代码展示
  - 修改 `src/renderer/components/Message.tsx`：识别 excalidraw SDK 代码块
  - 实现可折叠区块（默认折叠）
  - _需求：需求 2.6_

- [ ] 12. 截图功能
  - 实现 `canvas:screenshot` IPC channel
  - Renderer 调用 exportToBlob() 保存到指定路径
  - Skill 工具层面暴露截图能力
  - _需求：需求 3.3_
