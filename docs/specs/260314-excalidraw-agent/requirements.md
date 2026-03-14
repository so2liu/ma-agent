# 需求文档

## 简介

为"小马快跑"Electron 桌面应用集成 Excalidraw 画布能力，使 AI agent 能够通过 built-in skill 驱动画图（流程图、设计图等），用户可在画布上手动编辑，agent 能感知用户的修改并继续协作。画布以 `.excalidraw` 文件形式存储在 workspace 目录，在右侧工作区以多 tab 形式展示。

## 需求

### 需求 1 - 画布文件管理

**用户故事：** 作为用户，我想要在 workspace 中创建和管理 `.excalidraw` 文件，以便跨对话持久化我的图表。

#### 验收标准

1. 当用户或 agent 创建新画布时，系统应该在 workspace 目录下生成 `.excalidraw` 格式文件
2. 当用户打开一个 `.excalidraw` 文件时，系统应该在右侧工作区新开一个 tab 展示 Excalidraw 可编辑画布
3. 当用户在工作区打开多个 `.excalidraw` 文件时，系统应该以多 tab 形式并列展示
4. 当用户在画布上编辑后，系统应该自动保存修改到对应的 `.excalidraw` 文件

### 需求 2 - Agent 画图能力（TS SDK）

**用户故事：** 作为用户，我想要用自然语言指挥 agent 画图，agent 通过生成 TypeScript 代码调用 SDK 来操作画布。

#### 验收标准

1. 系统应该提供命令式 TS SDK，包含 `createRectangle()`、`createEllipse()`、`createDiamond()`、`createArrow()`、`createText()`、`createLine()` 等方法
2. 当 agent 生成 TS 代码后，系统应该先通过 `tsc` 进行语法和类型校验，校验失败时返回错误信息给 agent 重试
3. 当校验通过后，系统应该通过 `bun run` 子进程执行代码，将操作结果应用到画布
4. SDK 的 `createArrow()` 应该支持 `from/to` 引用已有元素 ID，转换层自动计算 binding 和锚点
5. SDK 应该支持 `element.update({ ... })` 补丁更新和 `element.delete()` 删除操作
6. Agent 生成的代码应该在聊天界面以可折叠区块展示给用户，默认折叠

### 需求 3 - Agent 查询画布状态（CLI）

**用户故事：** 作为 agent，我需要能读取当前画布的状态，以便理解用户的修改并在此基础上继续工作。

#### 验收标准

1. 系统应该提供 CLI 命令查询当前画布的元素列表（简化 JSON 格式）
2. CLI 返回的格式应该与 SDK 使用的简化格式一致（而非 excalidraw 原生格式）
3. 系统应该提供 CLI 命令获取画布截图，用于 agent 视觉验证

### 需求 4 - 双向同步

**用户故事：** 作为用户，我想要在画布上手动修改后，agent 能感知我的变化并在此基础上继续工作。

#### 验收标准

1. 当用户在 Excalidraw 画布上编辑元素时，系统应该通过 onChange 事件检测变更并生成变更摘要
2. 系统应该将用户的画布修改以输入框附件的形式展示给用户，当用户发送新指令时，变更摘要随消息一起发送给 agent
3. 当 agent 调用 CLI 查询画布状态时，系统应该返回包含用户最新修改的状态
4. 当 agent 通过 SDK 修改画布时，用户应该能在画布上实时看到变化

### 需求 5 - Built-in Skill 集成

**用户故事：** 作为用户，我想要在需要画图时 agent 自动使用画图能力，不需要我手动配置。

#### 验收标准

1. 系统应该将画图能力注册为 built-in skill，agent 在识别到画图意图时自动调用
2. Skill 的 `SKILL.md` 应该包含 SDK 类型定义和使用示例，作为 agent 的 cheat sheet
3. Skill 应该提供 CLI 工具脚本，供 agent 查询画布状态和截图
