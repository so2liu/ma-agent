# QuickJS WASM 沙箱低代码平台 — 架构设计

## 场景

用户在 chat 中描述：「我需要一个团建住宿登记应用，局域网使用，登记姓名、工号、是否住宿、车牌」

Claude 生成完整应用代码 → QuickJS WASM 沙箱执行后端逻辑 → Electron 内置 HTTP Server 对局域网提供服务。

---

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │  Claude Chat  │   │  HTTP Server │   │  QuickJS    │ │
│  │  (现有)       │──▶│  (node:http) │◀─▶│  WASM 沙箱  │ │
│  │              │   │  :3456       │   │             │ │
│  └──────────────┘   └──────┬───────┘   └─────────────┘ │
│         │                  │                  ▲         │
│         │           ┌──────┴───────┐          │         │
│         │           │ Static Files │    ┌─────┴──────┐  │
│         │           │ (生成的前端)  │    │ JSON Store │  │
│         ▼           └──────────────┘    │ (虚拟文件)  │  │
│  ┌──────────────┐                       └────────────┘  │
│  │ App Manager  │  ← 管理生成的应用生命周期              │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
         │
         │ LAN: http://192.168.1.x:3456
         ▼
┌─────────────────┐
│  同事的浏览器    │  ← 纯 HTML/CSS/JS，无需安装
└─────────────────┘
```

---

## 核心模块设计

### 1. QuickJS WASM 沙箱 (`src/main/lib/sandbox/`)

```
src/main/lib/sandbox/
├── quickjs-runtime.ts     # QuickJS WASM 初始化 & 生命周期
├── sandbox-api.ts         # 注入沙箱的宿主 API（存储、日志）
├── virtual-fs.ts          # 虚拟文件系统（JSON 持久化）
└── types.ts               # 沙箱相关类型
```

**依赖**: `quickjs-emscripten` (底层) 或 `@sebastianwessel/quickjs` (高层封装)

**推荐用 `@sebastianwessel/quickjs`**，理由：
- 内置 TypeScript 支持（Claude 生成 TS 代码可直接执行）
- 内置虚拟文件系统
- 内置 fetch 模拟（可控）
- API 更友好

#### quickjs-runtime.ts 核心逻辑

```typescript
import { quickJS } from '@sebastianwessel/quickjs'

interface SandboxApp {
  id: string
  name: string
  status: 'running' | 'stopped' | 'error'
  port: number
  handleRequest: (req: SandboxRequest) => Promise<SandboxResponse>
  dispose: () => void
}

interface SandboxRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: string | null
}

interface SandboxResponse {
  status: number
  headers: Record<string, string>
  body: string
}

async function createSandboxApp(code: string, appId: string): Promise<SandboxApp> {
  const { createRuntime } = await quickJS()

  const runtime = await createRuntime({
    // 内存限制 32MB，防止恶意代码
    memoryLimit: 1024 * 1024 * 32,
    // 执行时间限制 5s
    maxStackSize: 1024 * 1024,
    // 不给 fetch —— 安全隔离
    allowFetch: false,
    // 挂载虚拟文件系统用于数据持久化
    mountFs: {
      '/data': {
        'db.json': '[]'  // 初始空数据
      }
    },
  })

  // 注入宿主提供的安全 API
  // 见 sandbox-api.ts
  injectHostAPIs(runtime, appId)

  // 执行用户代码（Claude 生成的后端逻辑）
  const result = await runtime.evalCode(code)

  return {
    id: appId,
    name: '',
    status: 'running',
    port: 0,
    handleRequest: async (req) => {
      // 调用沙箱内的 handleRequest 函数
      return runtime.evalCode(`handleRequest(${JSON.stringify(req)})`)
    },
    dispose: () => runtime.dispose()
  }
}
```

### 2. 宿主注入 API (`sandbox-api.ts`)

沙箱内的代码**只能**通过这些 API 与外界交互：

```typescript
// 沙箱内可用的全局 API（宿主注入）
declare global {
  const DB: {
    /** 读取所有记录 */
    getAll(): Record<string, unknown>[]
    /** 按 ID 读取 */
    getById(id: string): Record<string, unknown> | null
    /** 插入记录，返回带 id 的记录 */
    insert(record: Record<string, unknown>): Record<string, unknown>
    /** 更新记录 */
    update(id: string, data: Record<string, unknown>): boolean
    /** 删除记录 */
    remove(id: string): boolean
    /** 按条件查询 */
    query(filter: Record<string, unknown>): Record<string, unknown>[]
  }

  const Logger: {
    info(msg: string): void
    error(msg: string): void
  }
}
```

**不注入的东西**（安全边界）：
- ❌ `fetch` — 不能发网络请求
- ❌ `fs` — 不能访问真实文件系统
- ❌ `process` — 不能执行系统命令
- ❌ `require/import` — 不能加载外部模块

### 3. HTTP Server (`src/main/lib/sandbox/http-server.ts`)

```typescript
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'

interface AppServer {
  port: number
  lanUrl: string
  localUrl: string
  stop: () => Promise<void>
}

async function startAppServer(
  appId: string,
  frontendHtml: string,
  sandboxApp: SandboxApp
): Promise<AppServer> {
  const port = await findAvailablePort(3456, 3500)

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)

    // 静态前端
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(frontendHtml)
      return
    }

    // API 路由 → 转发到 QuickJS 沙箱
    if (url.pathname.startsWith('/api/')) {
      const body = await readBody(req)
      const sandboxReq: SandboxRequest = {
        method: req.method ?? 'GET',
        path: url.pathname,
        headers: req.headers as Record<string, string>,
        body
      }

      try {
        const sandboxRes = await sandboxApp.handleRequest(sandboxReq)
        res.writeHead(sandboxRes.status, sandboxRes.headers)
        res.end(sandboxRes.body)
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal sandbox error' }))
      }
      return
    }

    res.writeHead(404)
    res.end('Not Found')
  })

  server.listen(port)

  const lanIp = getLanIP()

  return {
    port,
    lanUrl: `http://${lanIp}:${port}`,
    localUrl: `http://localhost:${port}`,
    stop: () => new Promise(resolve => server.close(() => resolve()))
  }
}

function getLanIP(): string {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}
```

### 4. App Manager (`src/main/lib/sandbox/app-manager.ts`)

管理多个生成应用的生命周期：

```typescript
interface ManagedApp {
  id: string
  name: string
  description: string
  status: 'running' | 'stopped' | 'error'
  port: number
  lanUrl: string
  localUrl: string
  createdAt: string
  sandbox: SandboxApp
  server: AppServer
}

class AppManager {
  private apps = new Map<string, ManagedApp>()

  /** Claude 生成代码后调用 */
  async deploy(params: {
    name: string
    description: string
    frontendCode: string  // 完整 HTML（含 CSS + JS）
    backendCode: string   // QuickJS 沙箱内执行的 JS
  }): Promise<ManagedApp> {
    const id = crypto.randomUUID()

    // 1. 启动沙箱
    const sandbox = await createSandboxApp(params.backendCode, id)

    // 2. 启动 HTTP Server
    const server = await startAppServer(id, params.frontendCode, sandbox)

    const app: ManagedApp = {
      id,
      name: params.name,
      description: params.description,
      status: 'running',
      port: server.port,
      lanUrl: server.lanUrl,
      localUrl: server.localUrl,
      createdAt: new Date().toISOString(),
      sandbox,
      server
    }

    this.apps.set(id, app)
    return app
  }

  async stop(appId: string): Promise<void> { /* ... */ }
  async restart(appId: string): Promise<void> { /* ... */ }
  list(): ManagedApp[] { /* ... */ }
  async dispose(): Promise<void> { /* 关闭所有 */ }
}
```

---

## Claude 生成的代码示例

### 用户输入

> 做一个团建住宿登记应用，登记姓名、工号、是否住宿、车牌

### Claude 生成 — 后端代码 (在 QuickJS 沙箱内运行)

```javascript
// backend.js — 运行在 QuickJS WASM 沙箱中
// 只能使用宿主注入的 DB 和 Logger API

function handleRequest(req) {
  const { method, path, body } = req

  // GET /api/registrations — 获取所有登记
  if (method === 'GET' && path === '/api/registrations') {
    const records = DB.getAll()
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(records)
    }
  }

  // POST /api/registrations — 新增登记
  if (method === 'POST' && path === '/api/registrations') {
    const data = JSON.parse(body)

    // 验证必填字段
    if (!data.name || !data.employeeId) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: '姓名和工号为必填项' })
      }
    }

    // 检查工号是否已登记
    const existing = DB.query({ employeeId: data.employeeId })
    if (existing.length > 0) {
      return {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: '该工号已登记' })
      }
    }

    const record = DB.insert({
      name: data.name,
      employeeId: data.employeeId,
      needAccommodation: !!data.needAccommodation,
      licensePlate: data.licensePlate || '',
      registeredAt: new Date().toISOString()
    })

    Logger.info(`新登记: ${data.name} (${data.employeeId})`)

    return {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    }
  }

  // DELETE /api/registrations/:id — 删除登记
  if (method === 'DELETE' && path.startsWith('/api/registrations/')) {
    const id = path.split('/').pop()
    const success = DB.remove(id)
    return {
      status: success ? 204 : 404,
      headers: {},
      body: ''
    }
  }

  // GET /api/stats — 统计信息
  if (method === 'GET' && path === '/api/stats') {
    const all = DB.getAll()
    const stats = {
      total: all.length,
      needAccommodation: all.filter(r => r.needAccommodation).length,
      withCar: all.filter(r => r.licensePlate).length
    }
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stats)
    }
  }

  return { status: 404, headers: {}, body: 'Not Found' }
}
```

### Claude 生成 — 前端代码 (单文件 HTML)

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>团建住宿登记</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, system-ui, sans-serif; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { text-align: center; margin-bottom: 24px; color: #1a1a1a; }

    .card {
      background: white; border-radius: 12px; padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 16px;
    }

    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; margin-bottom: 6px; font-weight: 500; color: #333; }
    .form-group input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 15px; }
    .form-group input:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }

    .checkbox-group { display: flex; align-items: center; gap: 8px; }
    .checkbox-group input { width: auto; }

    .btn {
      width: 100%; padding: 12px; background: #4f46e5; color: white;
      border: none; border-radius: 8px; font-size: 16px; cursor: pointer;
    }
    .btn:hover { background: #4338ca; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
    .stat { background: white; border-radius: 8px; padding: 16px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .stat-value { font-size: 28px; font-weight: 700; color: #4f46e5; }
    .stat-label { font-size: 13px; color: #888; margin-top: 4px; }

    .table { width: 100%; border-collapse: collapse; }
    .table th { text-align: left; padding: 10px; border-bottom: 2px solid #eee; color: #666; font-size: 13px; }
    .table td { padding: 10px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    .badge-yes { color: #16a34a; font-weight: 500; }
    .badge-no { color: #dc2626; font-weight: 500; }

    .toast {
      position: fixed; top: 20px; right: 20px; padding: 12px 20px;
      border-radius: 8px; color: white; font-size: 14px; z-index: 100;
      animation: slideIn 0.3s ease;
    }
    .toast-success { background: #16a34a; }
    .toast-error { background: #dc2626; }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  </style>
</head>
<body>
  <div class="container">
    <h1>🏨 团建住宿登记</h1>

    <div class="stats" id="stats"></div>

    <div class="card">
      <form id="form">
        <div class="form-group">
          <label>姓名 *</label>
          <input name="name" required placeholder="请输入姓名">
        </div>
        <div class="form-group">
          <label>工号 *</label>
          <input name="employeeId" required placeholder="请输入工号">
        </div>
        <div class="form-group">
          <div class="checkbox-group">
            <input type="checkbox" name="needAccommodation" id="needAccommodation">
            <label for="needAccommodation">需要住宿</label>
          </div>
        </div>
        <div class="form-group">
          <label>车牌号</label>
          <input name="licensePlate" placeholder="如有自驾请填写车牌">
        </div>
        <button type="submit" class="btn">提交登记</button>
      </form>
    </div>

    <div class="card">
      <h3 style="margin-bottom: 12px;">已登记人员</h3>
      <table class="table">
        <thead>
          <tr><th>姓名</th><th>工号</th><th>住宿</th><th>车牌</th></tr>
        </thead>
        <tbody id="list"></tbody>
      </table>
    </div>
  </div>

  <script>
    const API = '/api'

    async function loadStats() {
      const res = await fetch(`${API}/stats`)
      const s = await res.json()
      document.getElementById('stats').innerHTML = `
        <div class="stat"><div class="stat-value">${s.total}</div><div class="stat-label">总登记</div></div>
        <div class="stat"><div class="stat-value">${s.needAccommodation}</div><div class="stat-label">需住宿</div></div>
        <div class="stat"><div class="stat-value">${s.withCar}</div><div class="stat-label">自驾</div></div>
      `
    }

    async function loadList() {
      const res = await fetch(`${API}/registrations`)
      const list = await res.json()
      document.getElementById('list').innerHTML = list.map(r => `
        <tr>
          <td>${r.name}</td>
          <td>${r.employeeId}</td>
          <td class="${r.needAccommodation ? 'badge-yes' : 'badge-no'}">${r.needAccommodation ? '是' : '否'}</td>
          <td>${r.licensePlate || '-'}</td>
        </tr>
      `).join('')
    }

    function toast(msg, type = 'success') {
      const el = document.createElement('div')
      el.className = `toast toast-${type}`
      el.textContent = msg
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 3000)
    }

    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const data = {
        name: fd.get('name'),
        employeeId: fd.get('employeeId'),
        needAccommodation: fd.has('needAccommodation'),
        licensePlate: fd.get('licensePlate')
      }
      try {
        const res = await fetch(`${API}/registrations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        if (!res.ok) {
          const err = await res.json()
          toast(err.error, 'error')
          return
        }
        toast('登记成功！')
        e.target.reset()
        loadStats()
        loadList()
      } catch (err) {
        toast('提交失败，请重试', 'error')
      }
    })

    // 初始加载
    loadStats()
    loadList()
    // 每 10 秒自动刷新
    setInterval(() => { loadStats(); loadList() }, 10000)
  </script>
</body>
</html>
```

---

## IPC 新增通道

### 需要新增的 IPC 通道

| 通道 | 方向 | 说明 |
|---|---|---|
| `app:deploy` | renderer → main | 部署生成的应用 (前端+后端代码) |
| `app:stop` | renderer → main | 停止应用 |
| `app:restart` | renderer → main | 重启应用 |
| `app:list` | renderer → main | 获取所有应用列表 |
| `app:status` | main → renderer | 应用状态变更事件 |
| `app:log` | main → renderer | 沙箱日志输出 |

### Handler 注册 (`src/main/handlers/app-handlers.ts`)

```typescript
import { ipcMain } from 'electron'
import { AppManager } from '../lib/sandbox/app-manager'

const appManager = new AppManager()

export function registerAppHandlers() {
  ipcMain.handle('app:deploy', async (_event, params) => {
    const app = await appManager.deploy(params)
    return {
      id: app.id,
      name: app.name,
      lanUrl: app.lanUrl,
      localUrl: app.localUrl,
      port: app.port
    }
  })

  ipcMain.handle('app:stop', async (_event, appId: string) => {
    await appManager.stop(appId)
  })

  ipcMain.handle('app:list', () => {
    return appManager.list().map(app => ({
      id: app.id,
      name: app.name,
      status: app.status,
      lanUrl: app.lanUrl,
      port: app.port
    }))
  })
}
```

---

## 安全模型

```
┌─────────────────────────────────────────────────┐
│                  Trust Boundary                  │
│                                                  │
│  Electron Main Process (全部权限)                 │
│  ├── node:http (监听端口)                        │
│  ├── node:fs (持久化数据)                        │
│  └── AppManager (控制沙箱生命周期)                │
│       │                                          │
│       │  只暴露 DB + Logger API                   │
│       ▼                                          │
│  ┌──────────────────────────────┐                │
│  │   QuickJS WASM Sandbox       │                │
│  │                              │                │
│  │   ✅ DB.getAll/insert/...    │                │
│  │   ✅ Logger.info/error       │                │
│  │   ✅ JSON.parse/stringify    │                │
│  │   ✅ 基本 JS 运算            │                │
│  │                              │                │
│  │   ❌ fetch                   │                │
│  │   ❌ fs / 真实文件系统       │                │
│  │   ❌ process / child_process │                │
│  │   ❌ require / dynamic import│                │
│  │   ❌ eval (可选禁用)         │                │
│  │   ❌ WebSocket               │                │
│  │                              │                │
│  │   ⏱ 内存上限: 32MB           │                │
│  │   ⏱ 单次执行超时: 5s         │                │
│  └──────────────────────────────┘                │
└─────────────────────────────────────────────────┘
```

---

## Claude 工具集成 — 新增 Tool

在 Claude Agent SDK 的 tool 定义中新增一个 `deploy_app` tool：

```typescript
// src/main/lib/claude-tools.ts
const deployAppTool = {
  name: 'deploy_app',
  description: '部署一个 Web 应用到本地服务器，供局域网用户访问',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '应用名称' },
      description: { type: 'string', description: '应用描述' },
      frontend_html: { type: 'string', description: '完整的 HTML 文件（含 CSS 和 JS）' },
      backend_js: { type: 'string', description: 'QuickJS 沙箱内执行的后端 JS 代码' }
    },
    required: ['name', 'frontend_html', 'backend_js']
  }
}
```

Claude 会在对话中使用这个 tool，Electron main process 拦截 tool_use 事件，调用 AppManager.deploy()，然后把 URL 返回给 Claude 显示在聊天中。

---

## 用户交互流程

```
用户: "做一个团建住宿登记应用"
  │
  ▼
Claude 思考并生成代码
  │
  ▼
Claude 调用 deploy_app tool
  ├── frontend_html: "<!DOCTYPE html>..."
  └── backend_js: "function handleRequest(req) {...}"
  │
  ▼
Main Process 执行:
  1. createSandboxApp(backend_js)  → QuickJS WASM 实例
  2. startAppServer(frontend_html) → HTTP Server on :3456
  3. 返回 { lanUrl, localUrl }
  │
  ▼
Claude 回复用户:
  "✅ 应用已部署！
   局域网访问: http://192.168.1.100:3456
   本机访问: http://localhost:3456

   同事们用手机或电脑打开上面的链接就能登记了。"
  │
  ▼
用户把链接发到工作群 → 同事们用浏览器打开 → 填写登记
```

---

## 数据持久化

沙箱内的 `DB` API 实际由宿主实现，持久化到 Electron userData 目录：

```
~/.config/Claude Agent Desktop/
├── config.json
├── conversations/
└── apps/                          ← 新增
    └── {app-id}/
        ├── meta.json              # 应用元数据（名称、描述、创建时间）
        ├── frontend.html          # 前端代码
        ├── backend.js             # 后端代码
        └── data.json              # DB 数据（JSON 数组）
```

好处：
- 应用重启后数据不丢失
- 可以在 Electron 关闭后重新启动应用
- 可以导出/备份数据

---

## 实现优先级

### Phase 1 — MVP (可演示)
1. `quickjs-runtime.ts` — QuickJS WASM 初始化 + DB API 注入
2. `http-server.ts` — 静态 HTML + API 代理
3. `app-manager.ts` — 基本的 deploy/stop
4. `app-handlers.ts` — IPC 通道注册
5. 硬编码团建登记应用作为 demo

### Phase 2 — Claude 集成
6. 新增 `deploy_app` tool 定义
7. 在 `claude-session.ts` 中拦截 tool_use 调用 AppManager
8. 渲染器显示已部署应用列表 + 链接

### Phase 3 — 完善
9. 应用管理 UI（启动/停止/删除/查看日志）
10. 数据导出（CSV/Excel）
11. 多应用并行（端口分配）
12. 应用模板系统

---

## 依赖变更

```json
// package.json 新增
{
  "dependencies": {
    "@sebastianwessel/quickjs": "^2.x"
  }
}
```

只需新增 **1 个依赖**，QuickJS WASM ~1.3MB，不影响应用体积。

---

## 对比其他方案

| 方案 | 安全性 | 复杂度 | 依赖 | 性能 |
|---|---|---|---|---|
| **QuickJS WASM** | ⭐⭐⭐⭐⭐ | ⭐⭐ 低 | 1 个 npm 包 | 够用 |
| Deno 子进程 | ⭐⭐⭐⭐ | ⭐⭐⭐ 中 | 需捆绑 Deno 二进制 (~100MB) | 好 |
| Docker 容器 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ 高 | 需用户装 Docker | 好 |
| vm2/isolated-vm | ⭐⭐ | ⭐ 低 | Node native addon | 好 |
| 直接 eval | ⭐ 不安全 | ⭐ 低 | 无 | 最好 |

**QuickJS WASM 是最优解**：安全性最高（WASM 天然沙箱）、复杂度最低、无外部依赖。
