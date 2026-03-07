# QuickJS WASM 低代码平台 — 架构设计 v2

## 核心思路转变

~~v1: 给智能体加 `deploy_app` 自定义 tool~~
**v2: 智能体只负责写文件，用户手动点「发布」**

智能体已经会写文件（Write tool），不需要新 tool。
我们只需要：
1. 一个 **Skill** 告诉智能体 "写什么、写到哪里、什么格式"
2. Electron UI **监听约定目录**，发现新应用就显示卡片 + 发布按钮
3. 用户点「发布」→ Electron 启动 QuickJS 沙箱 + HTTP Server

---

## 用户完整体验流程

```
用户: "帮我做一个团建住宿登记应用，局域网使用，
       登记姓名、工号、是否住宿、车牌"
  │
  ▼
┌──────────────────────────────────────────────┐
│ 智能体内部流程（对用户透明）                    │
│                                              │
│ 1. 读取 SKILL.md → 了解文件约定               │
│ 2. Write → workspace/apps/住宿登记/app.json  │
│ 3. Write → workspace/apps/住宿登记/index.html │
│ 4. Write → workspace/apps/住宿登记/server.js  │
│ 5. 回复用户: "应用已生成，请点击发布按钮"       │
└──────────────────────────────────────────────┘
  │
  ▼
Electron UI 侧边栏自动出现:
  ┌─────────────────────────┐
  │ 📱 住宿登记              │
  │ 团建住宿登记应用         │
  │                         │
  │ 状态: 未发布             │
  │                         │
  │  [预览]  [发布到局域网]   │
  └─────────────────────────┘
  │
  ▼ 用户点击「发布到局域网」
  │
  ▼
Electron 后台:
  1. 读取 server.js → 创建 QuickJS WASM 沙箱
  2. 读取 index.html → 启动 HTTP Server on :3456
  3. 获取局域网 IP
  │
  ▼
  ┌─────────────────────────┐
  │ 📱 住宿登记              │
  │ 团建住宿登记应用         │
  │                         │
  │ 状态: ● 运行中           │
  │ 局域网: http://192.168.  │
  │         1.100:3456       │
  │                         │
  │  [复制链接] [停止] [日志] │
  └─────────────────────────┘
  │
  ▼
用户复制链接发到工作群 → 同事用浏览器打开
```

---

## 一、Skill 设计：`web-app`

### `.claude/skills/web-app/SKILL.md`

```markdown
---
name: web-app
description: 生成可发布的 Web 应用。用户要求创建网页应用、表单、登记系统、管理后台等场景时使用此 Skill。
license: MIT
---

# Web App Skill

当用户要求创建一个 Web 应用时，按以下约定生成文件。

## 文件约定

所有应用文件写入 `apps/{app-name}/` 目录（在 workspace 根目录下）。
`{app-name}` 使用英文小写 + 连字符命名（如 `hotel-registration`）。

每个应用必须包含以下文件：

### 1. `app.json` — 应用描述文件

```json
{
  "name": "住宿登记",
  "description": "团建住宿登记应用，登记姓名、工号、是否住宿、车牌",
  "version": "1.0.0",
  "icon": "📋"
}
```

### 2. `index.html` — 前端页面（单文件，含 CSS + JS）

要求：
- 单个 HTML 文件，内联所有 CSS 和 JS
- 移动端优先的响应式设计（同事可能用手机打开）
- API 请求统一使用 `/api/` 前缀
- 不依赖任何外部 CDN（局域网可能无互联网）
- 中文界面

### 3. `server.js` — 后端逻辑（运行在 QuickJS WASM 沙箱中）

要求：
- 导出一个 `handleRequest(req)` 函数
- 只能使用沙箱提供的全局 API（见下方）
- 不能使用 fetch、fs、require、import 等

#### 沙箱可用 API

```javascript
// 数据存储（宿主自动持久化到 JSON 文件）
DB.getAll()                          // → Record[]
DB.getById(id)                       // → Record | null
DB.insert(record)                    // → Record（自动加 id + createdAt）
DB.update(id, partialRecord)         // → boolean
DB.remove(id)                        // → boolean
DB.query({ field: value })           // → Record[]

// 日志
Logger.info(message)
Logger.error(message)
```

#### handleRequest 签名

```javascript
/**
 * @param {Object} req
 * @param {string} req.method  - "GET" | "POST" | "PUT" | "DELETE"
 * @param {string} req.path    - 如 "/api/registrations"
 * @param {Object} req.headers - HTTP headers
 * @param {string|null} req.body - 请求体（JSON 字符串）
 *
 * @returns {Object} res
 * @returns {number} res.status  - HTTP 状态码
 * @returns {Object} res.headers - 响应 headers
 * @returns {string} res.body    - 响应体
 */
function handleRequest(req) {
  // ...
  return { status: 200, headers: { 'Content-Type': 'application/json' }, body: '{}' }
}
```

## 完成后

告诉用户：
- 应用文件已生成
- 请在侧边栏找到应用卡片，点击「发布到局域网」
- 发布后会获得一个局域网链接，发给同事即可使用
```

---

## 二、智能体行为示例（实际 tool_use 序列）

用户输入：
> 帮我做一个团建住宿登记应用，局域网使用，登记姓名、工号、是否住宿、车牌

智能体的 tool 调用序列：

```
1. Read(".claude/skills/web-app/SKILL.md")
   → 了解文件约定和沙箱 API

2. Write("apps/hotel-registration/app.json")
   → { "name": "住宿登记", "icon": "📋", ... }

3. Write("apps/hotel-registration/index.html")
   → 完整 HTML（含表单 + 列表 + 统计 + 样式）

4. Write("apps/hotel-registration/server.js")
   → handleRequest 函数（含 CRUD 路由 + 校验）
```

智能体最终回复：

> 应用已生成！包含以下文件：
> - `apps/hotel-registration/app.json` — 应用配置
> - `apps/hotel-registration/index.html` — 前端界面（移动端适配）
> - `apps/hotel-registration/server.js` — 后端 API
>
> 请在侧边栏找到「住宿登记」卡片，点击 **「发布到局域网」** 按钮，
> 然后把生成的链接发到工作群，同事们用浏览器打开就能登记了。

---

## 三、Electron 端实现

### 3.1 文件目录约定

```
workspace/                        ← 用户的 workspace（已有）
├── .claude/                      ← skills（已有）
├── attachments/                  ← 附件（已有）
└── apps/                         ← 新增：生成的应用目录
    └── hotel-registration/
        ├── app.json              # 应用元数据
        ├── index.html            # 前端代码
        ├── server.js             # 后端代码（QuickJS 沙箱执行）
        └── data.json             # 运行时数据（发布后自动创建）
```

### 3.2 新增模块

```
src/main/lib/sandbox/
├── quickjs-runtime.ts            # QuickJS WASM 引擎封装
├── sandbox-api.ts                # DB + Logger 宿主 API 实现
├── http-server.ts                # HTTP Server（serve 前端 + 代理 API）
└── app-manager.ts                # 扫描 apps/ 目录 + 管理运行状态

src/main/handlers/
└── app-handlers.ts               # IPC: app:list, app:publish, app:stop

src/renderer/components/
└── AppPanel.tsx                  # 侧边栏应用卡片列表
```

### 3.3 App Manager 核心逻辑

```typescript
// src/main/lib/sandbox/app-manager.ts

class AppManager {
  private runningApps = new Map<string, RunningApp>()

  /** 扫描 workspace/apps/ 目录，返回所有应用 */
  async scanApps(workspaceDir: string): Promise<AppInfo[]> {
    const appsDir = path.join(workspaceDir, 'apps')
    if (!fs.existsSync(appsDir)) return []

    const dirs = fs.readdirSync(appsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())

    const apps: AppInfo[] = []
    for (const dir of dirs) {
      const appJsonPath = path.join(appsDir, dir.name, 'app.json')
      if (!fs.existsSync(appJsonPath)) continue

      const meta = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'))
      const running = this.runningApps.get(dir.name)

      apps.push({
        id: dir.name,
        name: meta.name,
        description: meta.description,
        icon: meta.icon ?? '📱',
        status: running ? 'running' : 'stopped',
        lanUrl: running?.lanUrl ?? null,
        localUrl: running?.localUrl ?? null,
        port: running?.port ?? null,
      })
    }
    return apps
  }

  /** 用户点击「发布」后调用 */
  async publish(workspaceDir: string, appId: string): Promise<PublishResult> {
    const appDir = path.join(workspaceDir, 'apps', appId)

    // 1. 读取文件
    const frontendHtml = fs.readFileSync(path.join(appDir, 'index.html'), 'utf-8')
    const backendJs = fs.readFileSync(path.join(appDir, 'server.js'), 'utf-8')
    const dataPath = path.join(appDir, 'data.json')

    // 2. 初始化数据文件（如果不存在）
    if (!fs.existsSync(dataPath)) {
      fs.writeFileSync(dataPath, '[]')
    }

    // 3. 创建 QuickJS 沙箱
    const sandbox = await createSandboxApp(backendJs, {
      dataPath,  // DB API 读写这个文件
    })

    // 4. 启动 HTTP Server
    const server = await startAppServer(frontendHtml, sandbox)

    // 5. 记录运行状态
    this.runningApps.set(appId, {
      sandbox,
      server,
      lanUrl: server.lanUrl,
      localUrl: server.localUrl,
      port: server.port,
    })

    return {
      lanUrl: server.lanUrl,
      localUrl: server.localUrl,
      port: server.port,
    }
  }

  /** 用户点击「停止」 */
  async stop(appId: string): Promise<void> {
    const app = this.runningApps.get(appId)
    if (!app) return
    await app.server.stop()
    app.sandbox.dispose()
    this.runningApps.delete(appId)
  }
}
```

### 3.4 IPC 通道

| 通道 | 方向 | 触发时机 | 说明 |
|---|---|---|---|
| `app:scan` | renderer → main | 侧边栏加载时 | 扫描 apps/ 返回应用列表 |
| `app:publish` | renderer → main | 用户点「发布」 | 启动沙箱 + HTTP Server |
| `app:stop` | renderer → main | 用户点「停止」 | 关闭沙箱 + Server |
| `app:open-dir` | renderer → main | 用户点「打开目录」| 在文件管理器中打开 app 目录 |

**注意：没有 `app:deploy`** — 部署（写文件）由智能体的 Write tool 完成，不走 IPC。

### 3.5 渲染器 — AppPanel 组件

```tsx
// src/renderer/components/AppPanel.tsx

function AppPanel() {
  const [apps, setApps] = useState<AppInfo[]>([])

  useEffect(() => {
    // 首次加载 + 定时刷新（检测智能体新生成的应用）
    const load = () => window.electron.invoke('app:scan').then(setApps)
    load()
    const timer = setInterval(load, 3000)  // 每 3 秒扫描一次
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="app-panel">
      <h3>我的应用</h3>
      {apps.map(app => (
        <AppCard key={app.id} app={app} onRefresh={load} />
      ))}
      {apps.length === 0 && (
        <p className="text-muted">
          在对话中告诉 Claude 你想要什么应用，
          它会帮你生成到这里。
        </p>
      )}
    </div>
  )
}

function AppCard({ app, onRefresh }) {
  const [publishing, setPublishing] = useState(false)

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const result = await window.electron.invoke('app:publish', app.id)
      // 显示局域网链接
      toast(`已发布到 ${result.lanUrl}`)
      onRefresh()
    } finally {
      setPublishing(false)
    }
  }

  const handleStop = async () => {
    await window.electron.invoke('app:stop', app.id)
    onRefresh()
  }

  return (
    <div className="app-card">
      <div className="app-header">
        <span className="app-icon">{app.icon}</span>
        <span className="app-name">{app.name}</span>
        <StatusBadge status={app.status} />
      </div>
      <p className="app-desc">{app.description}</p>

      {app.status === 'stopped' ? (
        <button onClick={handlePublish} disabled={publishing}>
          {publishing ? '发布中...' : '发布到局域网'}
        </button>
      ) : (
        <div className="app-running">
          <div className="lan-url">
            <code>{app.lanUrl}</code>
            <button onClick={() => copyToClipboard(app.lanUrl)}>
              复制链接
            </button>
          </div>
          <div className="app-actions">
            <button onClick={() => openInBrowser(app.localUrl)}>预览</button>
            <button onClick={handleStop}>停止</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## 四、QuickJS WASM 沙箱细节

### 4.1 DB API 宿主实现

```typescript
// src/main/lib/sandbox/sandbox-api.ts

import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

/**
 * 为 QuickJS 沙箱创建 DB API 的宿主实现
 * 数据持久化到 {appDir}/data.json
 */
function createDBApi(dataPath: string) {
  // 读取当前数据
  const load = (): Record<string, unknown>[] => {
    try {
      return JSON.parse(readFileSync(dataPath, 'utf-8'))
    } catch {
      return []
    }
  }

  // 写回数据
  const save = (records: Record<string, unknown>[]) => {
    writeFileSync(dataPath, JSON.stringify(records, null, 2))
  }

  return {
    getAll: () => load(),

    getById: (id: string) => load().find(r => r.id === id) ?? null,

    insert: (record: Record<string, unknown>) => {
      const records = load()
      const newRecord = {
        ...record,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      }
      records.push(newRecord)
      save(records)
      return newRecord
    },

    update: (id: string, data: Record<string, unknown>) => {
      const records = load()
      const idx = records.findIndex(r => r.id === id)
      if (idx === -1) return false
      records[idx] = { ...records[idx], ...data, id }
      save(records)
      return true
    },

    remove: (id: string) => {
      const records = load()
      const filtered = records.filter(r => r.id !== id)
      if (filtered.length === records.length) return false
      save(filtered)
      return true
    },

    query: (filter: Record<string, unknown>) => {
      return load().filter(record =>
        Object.entries(filter).every(([k, v]) => record[k] === v)
      )
    },
  }
}
```

### 4.2 安全边界

```
┌─────────────────────────────────────────────────┐
│               Electron Main Process             │
│                                                 │
│  智能体写文件 ──┐                                │
│  (Write tool)  │                                │
│                ▼                                │
│         workspace/apps/{name}/                  │
│         ├── app.json                            │
│         ├── index.html    ──┐                   │
│         ├── server.js     ──┤                   │
│         └── data.json     ──┤                   │
│                             │                   │
│  用户点击「发布」 ──────────▶│                   │
│                             ▼                   │
│  ┌──────────────────────────────────────┐       │
│  │         QuickJS WASM Sandbox         │       │
│  │                                      │       │
│  │  ✅ DB.getAll / insert / update ...  │       │
│  │  ✅ Logger.info / error              │       │
│  │  ✅ JSON / Math / String / Array     │       │
│  │  ✅ 基本 JS 运算                     │       │
│  │                                      │       │
│  │  ❌ fetch / XMLHttpRequest           │       │
│  │  ❌ fs / path / child_process        │       │
│  │  ❌ require / import                 │       │
│  │  ❌ eval (可禁用)                    │       │
│  │  ❌ WebSocket / Worker              │       │
│  │                                      │       │
│  │  ⏱ 内存: 32MB ⏱ 超时: 5s/请求      │       │
│  └──────────────────────────────────────┘       │
│                    │                            │
│                    ▼                            │
│  ┌──────────────────────────────────────┐       │
│  │    HTTP Server (node:http)           │       │
│  │    GET  / → index.html              │       │
│  │    *    /api/* → sandbox.handle()   │       │
│  │    Port: 3456-3500 (自动分配)        │       │
│  └──────────────────────────────────────┘       │
│                    │                            │
│         LAN: http://192.168.1.x:3456            │
└─────────────────────────────────────────────────┘
```

---

## 五、为什么「用户手动发布」更好

### vs 智能体自动部署（v1 方案）

| 对比项 | 智能体自动部署 (v1) | 用户手动发布 (v2) |
|---|---|---|
| **安全性** | 智能体直接启动网络服务 ⚠️ | 用户审查后手动发布 ✅ |
| **可控性** | 用户不知道何时开了端口 | 用户明确知道何时发布 |
| **可审查** | 代码在 tool_use 参数中，不好看 | 文件在 workspace，可以直接阅读 |
| **可修改** | 需要跟智能体说"改一下" | 用户可以直接编辑文件再发布 |
| **实现复杂度** | 需要新 tool + 拦截逻辑 | 只需文件约定 + UI 按钮 |
| **迭代体验** | "帮我改一下表单" → 重新部署 | 智能体改文件 → 用户点重新发布 |
| **离线使用** | 无法离线（依赖智能体） | 文件已生成，可以离线发布 |

### 关键优势

1. **用户有审查机会** — 发布前可以看代码，知道后端做了什么
2. **不需要新 SDK tool** — 复用已有的 Write tool，零学习成本
3. **文件可编辑** — 高级用户可以直接改 HTML/JS，不必走智能体
4. **关注点分离** — 智能体只管"生成"，平台只管"运行"

---

## 六、实现计划

### Phase 1 — 文件约定 + Skill (1 天)
- [ ] 创建 `.claude/skills/web-app/SKILL.md`
- [ ] 定义 `app.json` schema
- [ ] 测试：让智能体生成一个住宿登记应用的文件

### Phase 2 — QuickJS 沙箱运行时 (2 天)
- [ ] 安装 `@sebastianwessel/quickjs`
- [ ] 实现 `quickjs-runtime.ts` — 沙箱创建 + 代码执行
- [ ] 实现 `sandbox-api.ts` — DB API（JSON 文件持久化）
- [ ] 实现 `http-server.ts` — 静态文件 + API 代理
- [ ] 单元测试：沙箱执行 handleRequest

### Phase 3 — App Manager + IPC (1 天)
- [ ] 实现 `app-manager.ts` — 扫描/发布/停止
- [ ] 实现 `app-handlers.ts` — IPC 通道
- [ ] 更新 preload + renderer 类型

### Phase 4 — 渲染器 UI (1 天)
- [ ] `AppPanel.tsx` — 应用列表 + 卡片
- [ ] 集成到侧边栏（在 Chat 页面）
- [ ] 发布/停止/复制链接/预览 交互

### Phase 5 — 端到端测试
- [ ] 完整流程：对话生成 → 文件出现 → 发布 → 局域网访问 → 提交表单 → 数据持久化

---

## 七、依赖

```json
{
  "dependencies": {
    "@sebastianwessel/quickjs": "^2.x"    // +1.3MB，唯一新增
  }
}
```
