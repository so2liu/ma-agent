# Excalidraw 画图技能

通过 TypeScript SDK 和 CLI 工具在 Excalidraw 画布上绘制图表。

## 工具概览

### SDK 画图（复杂操作）

编写 TypeScript 代码，通过 SDK 创建、修改、删除图形元素。代码会先经过语法校验，再由 `bun run` 执行。

```typescript
import { ExcalidrawSDK } from './sdk';

const canvas = await ExcalidrawSDK.load('diagram.excalidraw');

// 创建图形
const box1 = canvas.createRectangle({ x: 100, y: 100, w: 200, h: 80, label: '服务A' });
const box2 = canvas.createRectangle({ x: 400, y: 100, w: 200, h: 80, label: '服务B' });

// 连接箭头
canvas.createArrow({ from: box1, to: box2, label: '调用' });

// 提交更改
await canvas.commit();
```

### CLI 查询（简单操作）

读取画布当前状态：

```bash
bun run .claude/skills/excalidraw/scripts/excalidraw-cli.ts read <file.excalidraw>
```

输出简化后的 JSON 元素列表。

## SDK API 参考

### ExcalidrawSDK

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `ExcalidrawSDK.load(filePath)` | 文件路径 | `Promise<ExcalidrawSDK>` | 加载或创建画布 |
| `createRectangle(opts)` | `{ x, y, w, h, label?, color?, fill? }` | `ElementRef` | 矩形 |
| `createEllipse(opts)` | `{ x, y, w, h, label?, color?, fill? }` | `ElementRef` | 椭圆 |
| `createDiamond(opts)` | `{ x, y, w, h, label?, color?, fill? }` | `ElementRef` | 菱形 |
| `createArrow(opts)` | `{ from, to, label?, color? }` | `ElementRef` | 箭头连线 |
| `createText(opts)` | `{ x, y, text, fontSize?, color? }` | `ElementRef` | 文本 |
| `createLine(opts)` | `{ points, color? }` | `ElementRef` | 折线 |
| `commit()` | — | `Promise<void>` | 提交所有操作 |

### ElementRef

| 方法 | 说明 |
|------|------|
| `update(patch)` | 更新元素属性 |
| `delete()` | 删除元素 |

### 类型

**ElementColor**: `'black'` | `'blue'` | `'red'` | `'green'` | `'orange'` | `'purple'` | `'pink'` | `'yellow'` | `'gray'`

**FillStyle**: `'solid'` | `'hachure'` | `'cross-hatch'` | `'none'`

## 常用场景速查

### 流程图

```typescript
const canvas = await ExcalidrawSDK.load('flow.excalidraw');
const start = canvas.createEllipse({ x: 200, y: 50, w: 120, h: 60, label: '开始', color: 'green', fill: 'solid' });
const step1 = canvas.createRectangle({ x: 170, y: 160, w: 180, h: 80, label: '处理数据' });
const decision = canvas.createDiamond({ x: 170, y: 300, w: 180, h: 100, label: '是否通过?' });
const end = canvas.createEllipse({ x: 200, y: 460, w: 120, h: 60, label: '结束', color: 'red', fill: 'solid' });

canvas.createArrow({ from: start, to: step1 });
canvas.createArrow({ from: step1, to: decision });
canvas.createArrow({ from: decision, to: end, label: '是' });
await canvas.commit();
```

### 架构图

```typescript
const canvas = await ExcalidrawSDK.load('arch.excalidraw');
const frontend = canvas.createRectangle({ x: 100, y: 100, w: 200, h: 80, label: '前端', color: 'blue', fill: 'solid' });
const api = canvas.createRectangle({ x: 400, y: 100, w: 200, h: 80, label: 'API 网关', color: 'green', fill: 'solid' });
const db = canvas.createRectangle({ x: 700, y: 100, w: 200, h: 80, label: '数据库', color: 'orange', fill: 'solid' });

canvas.createArrow({ from: frontend, to: api, label: 'HTTP' });
canvas.createArrow({ from: api, to: db, label: 'SQL' });
await canvas.commit();
```

### 修改已有元素

```typescript
const canvas = await ExcalidrawSDK.load('existing.excalidraw');
// 用 CLI 先读取现有元素 ID，然后通过 ElementRef 修改
const ref = new ElementRef('existing_element_id', canvas);
ref.update({ label: '新标签', color: 'red' });
ref.delete(); // 或删除
await canvas.commit();
```

## 注意事项

- 文件路径相对于工作区目录
- `commit()` 必须在最后调用，否则更改不会生效
- `from`/`to` 参数接受 `ElementRef` 或元素 ID 字符串
- 先用 CLI `read` 查看画布状态，再决定如何修改
