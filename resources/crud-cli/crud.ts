#!/usr/bin/env bun
/**
 * crud.ts — CRUD code generator for web apps
 *
 * Usage:
 *   bun run crud.ts init <app-id>
 *   bun run crud.ts generate <app-id> <entity>
 *
 * Run from the workspace root. Apps are created under ./apps/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ─── Helpers ──────────────────────────────────────────────────────────

/** Read conversation ID from workspace file written by the Electron renderer */
function readConversationIdFromWorkspace(): string | null {
  try {
    const filePath = join(process.cwd(), '.claude', 'current-conversation-id')
    if (!existsSync(filePath)) return null
    return readFileSync(filePath, 'utf-8').trim() || null
  } catch {
    return null
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function pluralize(s: string): string {
  if (s.endsWith('s') || s.endsWith('x') || s.endsWith('z') || s.endsWith('sh') || s.endsWith('ch')) {
    return s + 'es'
  }
  if (s.endsWith('y') && !'aeiou'.includes(s.charAt(s.length - 2))) {
    return s.slice(0, -1) + 'ies'
  }
  return s + 's'
}

function writeIfNotExists(path: string, content: string): void {
  if (!existsSync(path)) {
    writeFileSync(path, content)
    console.log(`  created ${path}`)
  } else {
    console.log(`  skipped ${path} (already exists)`)
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// ─── Init Command ─────────────────────────────────────────────────────

function init(appId: string): void {
  const appsDir = join(process.cwd(), 'apps')
  const appDir = join(appsDir, appId)

  if (existsSync(appDir)) {
    console.error(`Error: apps/${appId} already exists`)
    process.exit(1)
  }

  console.log(`Creating app: apps/${appId}`)

  // Create directory structure
  ensureDir(join(appDir, 'src', 'db'))
  ensureDir(join(appDir, 'src', 'server', 'routes'))
  ensureDir(join(appDir, 'src', 'pages'))

  // app.json — include conversationId so the UI can link back to the originating conversation
  const manifest: Record<string, string> = { name: appId, description: '', version: '1.0.0', icon: '📦' }
  const conversationId = process.env.CONVERSATION_ID || readConversationIdFromWorkspace()
  if (conversationId) {
    manifest.conversationId = conversationId
  }
  writeFileSync(join(appDir, 'app.json'), JSON.stringify(manifest, null, 2) + '\n')

  // package.json
  writeFileSync(
    join(appDir, 'package.json'),
    JSON.stringify(
      {
        name: appId,
        private: true,
        type: 'module',
        scripts: {
          'dev:server': 'bun --hot run src/server/index.ts',
          'dev:client': 'vite',
          build: 'vite build',
          'db:push': 'bun run src/db/push.ts',
        },
        dependencies: {
          react: '^19.2.0',
          'react-dom': '^19.2.0',
          '@tanstack/react-query': '^5.80.7',
          hono: '^4.7.0',
          'drizzle-orm': '^0.45.1',
        },
        devDependencies: {
          '@types/react': '^19.2.7',
          '@types/react-dom': '^19.2.3',
          '@vitejs/plugin-react': '^5.1.1',
          tailwindcss: '^4.1.16',
          '@tailwindcss/vite': '^4.1.17',
          typescript: '^5.9.3',
          vite: '^7.1.12',
          '@types/bun': 'latest',
        },
      },
      null,
      2
    ) + '\n'
  )

  // vite.config.ts
  writeFileSync(
    join(appDir, 'vite.config.ts'),
    `import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: \`http://localhost:\${process.env.API_PORT || 3001}\`,
        changeOrigin: true,
      },
    },
  },
})
`
  )

  // tsconfig.json
  writeFileSync(
    join(appDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          module: 'ESNext',
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          allowImportingTsExtensions: true,
        },
        include: ['src'],
      },
      null,
      2
    ) + '\n'
  )

  // index.html
  writeFileSync(
    join(appDir, 'index.html'),
    `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appId}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
  )

  // src/main.tsx
  writeFileSync(
    join(appDir, 'src', 'main.tsx'),
    `import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'

import './index.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
`
  )

  // src/index.css
  writeFileSync(join(appDir, 'src', 'index.css'), `@import 'tailwindcss';\n`)

  // src/App.tsx (placeholder — regenerated by crud generate)
  writeFileSync(
    join(appDir, 'src', 'App.tsx'),
    `export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">运行 crud generate 添加功能</p>
    </div>
  )
}
`
  )

  // src/db/index.ts
  writeFileSync(
    join(appDir, 'src', 'db', 'index.ts'),
    `import { drizzle } from 'drizzle-orm/bun-sqlite'

export const db = drizzle('./data.sqlite')
`
  )

  // src/db/push.ts — schema push using bun:sqlite (replaces drizzle-kit push)
  writeFileSync(
    join(appDir, 'src', 'db', 'push.ts'),
    `import { Database } from 'bun:sqlite'
import { getTableConfig, type SQLiteColumn } from 'drizzle-orm/sqlite-core'

import * as schema from './schema'

function serializeDefault(col: SQLiteColumn): string {
  const d = col.default
  if (d === undefined || d === null) return ''
  if (typeof d === 'object' && 'queryChunks' in d) {
    const sql = (d as { queryChunks: { value: string[] }[] }).queryChunks
      .map((c) => c.value.join(''))
      .join('')
    return \` DEFAULT \${sql}\`
  }
  if (typeof d === 'string') return \` DEFAULT '\${d.replace(/'/g, "''")}'\`
  return \` DEFAULT \${d}\`
}

function colDef(col: SQLiteColumn, forAlter = false): string {
  let def = \`"\${col.name}" \${col.getSQLType()}\`
  if (col.primary) {
    def += ' PRIMARY KEY'
    if ((col as unknown as { autoIncrement: boolean }).autoIncrement) def += ' AUTOINCREMENT'
  }
  // SQLite ALTER TABLE ADD COLUMN rejects NOT NULL without a default
  if (col.notNull && !col.primary && !(forAlter && !col.hasDefault)) def += ' NOT NULL'
  if (col.hasDefault) def += serializeDefault(col)
  return def
}

const db = new Database('./data.sqlite')
db.run('BEGIN')
try {
  for (const value of Object.values(schema)) {
    if (!value || typeof value !== 'object') continue
    let config
    try {
      config = getTableConfig(value as Parameters<typeof getTableConfig>[0])
    } catch {
      continue
    }
    const exists = db
      .query(\`SELECT name FROM sqlite_master WHERE type='table' AND name=?\`)
      .get(config.name)
    if (!exists) {
      const cols = config.columns.map((c) => colDef(c)).join(', ')
      db.run(\`CREATE TABLE "\${config.name}" (\${cols})\`)
      console.log(\`Created table: \${config.name}\`)
    } else {
      const existing = db.query(\`PRAGMA table_info("\${config.name}")\`).all() as { name: string }[]
      const existingNames = new Set(existing.map((c) => c.name))
      for (const col of config.columns) {
        if (!existingNames.has(col.name)) {
          db.run(\`ALTER TABLE "\${config.name}" ADD COLUMN \${colDef(col, true)}\`)
          console.log(\`Added column: \${config.name}.\${col.name}\`)
        }
      }
    }
  }
  db.run('COMMIT')
} catch (e) {
  db.run('ROLLBACK')
  throw e
}

console.log('Schema push complete.')
`
  )

  // src/db/schema.ts (empty — crud generate appends here)
  writeFileSync(
    join(appDir, 'src', 'db', 'schema.ts'),
    `import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
`
  )

  // src/server/index.ts
  writeFileSync(
    join(appDir, 'src', 'server', 'index.ts'),
    `import { Hono } from 'hono'
import { cors } from 'hono/cors'
// [crud:imports]

const app = new Hono()

app.use('/api/*', cors())

app.get('/api/health', (c) => c.json({ ok: true }))

// [crud:routes]

export default {
  port: Number(process.env.PORT || 3001),
  fetch: app.fetch,
}
`
  )

  console.log(`\nDone! Next steps:`)
  console.log(`  crud generate ${appId} <entity>`)
}

// ─── Generate Command ─────────────────────────────────────────────────

function generate(appId: string, entity: string): void {
  const appDir = join(process.cwd(), 'apps', appId)

  if (!existsSync(appDir)) {
    console.error(`Error: apps/${appId} does not exist. Run 'crud init ${appId}' first.`)
    process.exit(1)
  }

  const singular = entity.toLowerCase()
  const plural = pluralize(singular)
  const Singular = capitalize(singular)
  const tableName = plural

  console.log(`Generating CRUD for entity: ${singular} (table: ${tableName})`)

  // 1. Append table to src/db/schema.ts
  const schemaPath = join(appDir, 'src', 'db', 'schema.ts')
  const schemaContent = readFileSync(schemaPath, 'utf-8')

  if (schemaContent.includes(`export const ${tableName}`)) {
    console.error(`Error: table "${tableName}" already exists in schema.ts`)
    process.exit(1)
  }

  writeFileSync(
    schemaPath,
    schemaContent +
      `
export const ${tableName} = sqliteTable('${tableName}', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: text('created_at').default(sql\`(CURRENT_TIMESTAMP)\`).notNull(),
  // TODO: 添加字段，例如:
  // name: text('name').notNull(),
  // status: text('status').notNull(),
})

export type Insert${Singular} = typeof ${tableName}.$inferInsert
export type Select${Singular} = typeof ${tableName}.$inferSelect
`
  )
  console.log(`  updated src/db/schema.ts`)

  // 2. Create route file
  const routePath = join(appDir, 'src', 'server', 'routes', `${plural}.ts`)
  writeIfNotExists(
    routePath,
    `import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { db } from '../../db'
import { ${tableName} } from '../../db/schema'

const app = new Hono()

// GET /api/${plural}
app.get('/', (c) => {
  const all = db.select().from(${tableName}).all()
  return c.json(all)
})

// POST /api/${plural}
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const [row] = db.insert(${tableName}).values(body).returning().all()
    return c.json(row, 201)
  } catch (e) {
    return c.json({ error: String(e) }, 400)
  }
})

// PUT /api/${plural}/:id
app.put('/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    db.update(${tableName}).set(body).where(eq(${tableName}.id, id)).run()
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: String(e) }, 400)
  }
})

// DELETE /api/${plural}/:id
app.delete('/:id', (c) => {
  const id = Number(c.req.param('id'))
  db.delete(${tableName}).where(eq(${tableName}.id, id)).run()
  return c.json({ ok: true })
})

export default app
`
  )

  // 3. Update server/index.ts to register route
  const serverIndexPath = join(appDir, 'src', 'server', 'index.ts')
  let serverIndex = readFileSync(serverIndexPath, 'utf-8')

  const importLine = `import ${plural} from './routes/${plural}'`
  const routeLine = `app.route('/api/${plural}', ${plural})`

  if (!serverIndex.includes(importLine)) {
    serverIndex = serverIndex.replace('// [crud:imports]', `${importLine}\n// [crud:imports]`)
    serverIndex = serverIndex.replace('// [crud:routes]', `${routeLine}\n// [crud:routes]`)
    writeFileSync(serverIndexPath, serverIndex)
    console.log(`  updated src/server/index.ts`)
  }

  // 4. Create page component
  const pagePath = join(appDir, 'src', 'pages', `${Singular}Page.tsx`)
  writeIfNotExists(
    pagePath,
    `import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { Insert${Singular}, Select${Singular} } from '../db/schema'

export default function ${Singular}Page() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Partial<Insert${Singular}>>({})

  const { data: items = [] } = useQuery<Select${Singular}[]>({
    queryKey: ['${plural}'],
    queryFn: () => fetch('/api/${plural}').then((r) => r.json()),
    refetchInterval: 2000,
  })

  const create = useMutation({
    mutationFn: (data: Partial<Insert${Singular}>) =>
      fetch('/api/${plural}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error('提交失败')
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['${plural}'] })
      setForm({})
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => fetch(\`/api/${plural}/\${id}\`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['${plural}'] }),
  })

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">${Singular}</h1>

        {/* 表单 */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate(form)
            }}
            className="space-y-4"
          >
            {/* TODO: 添加表单字段，例如:
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">名称</label>
              <input
                type="text"
                value={form.name ?? ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="请输入名称"
              />
            </div>
            */}

            <button
              type="submit"
              disabled={create.isPending}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:bg-gray-400"
            >
              {create.isPending ? '提交中...' : '提交'}
            </button>
          </form>
        </div>

        {/* 列表 */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">列表</h2>
          {items.length === 0 ? (
            <p className="py-8 text-center text-gray-500">暂无数据</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-3">
                  {/* TODO: 自定义列表项显示 */}
                  <span className="text-sm text-gray-500">{JSON.stringify(item)}</span>
                  <button
                    onClick={() => remove.mutate(item.id)}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
`
  )

  // 5. Regenerate App.tsx based on all pages
  regenerateAppTsx(appDir)

  console.log(`\nDone! Next steps:`)
  console.log(`  1. Edit src/db/schema.ts — add fields to the ${tableName} table`)
  console.log(`  2. Edit src/pages/${Singular}Page.tsx — add form inputs and list display`)
}

/** Scan src/pages/ and regenerate App.tsx to include all pages */
function regenerateAppTsx(appDir: string): void {
  const pagesDir = join(appDir, 'src', 'pages')
  if (!existsSync(pagesDir)) return

  const pageFiles = readdirSync(pagesDir).filter((f) => f.endsWith('Page.tsx'))

  if (pageFiles.length === 0) return

  const pages = pageFiles.map((f) => {
    const component = f.replace('.tsx', '')
    return { component, file: f }
  })

  let content: string

  if (pages.length === 1) {
    // Single page — render directly
    const p = pages[0]
    content = `import ${p.component} from './pages/${p.component}'

export default function App() {
  return <${p.component} />
}
`
  } else {
    // Multiple pages — tab navigation
    const imports = pages.map((p) => `import ${p.component} from './pages/${p.component}'`).join('\n')
    const tabs = pages.map((p) => `  { label: '${p.component.replace('Page', '')}', component: ${p.component} },`)

    content = `import { useState } from 'react'

${imports}

const pages = [
${tabs.join('\n')}
]

export default function App() {
  const [active, setActive] = useState(0)
  const ActivePage = pages[active].component

  return (
    <div>
      {pages.length > 1 && (
        <nav className="flex gap-1 border-b border-gray-200 bg-white px-4">
          {pages.map((p, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={\`px-4 py-3 text-sm font-medium transition \${
                i === active
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }\`}
            >
              {p.label}
            </button>
          ))}
        </nav>
      )}
      <ActivePage />
    </div>
  )
}
`
  }

  writeFileSync(join(appDir, 'src', 'App.tsx'), content)
  console.log(`  regenerated src/App.tsx`)
}

// ─── CLI Entry ────────────────────────────────────────────────────────

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'init': {
    const appId = args[0]
    if (!appId) {
      console.error('Usage: crud init <app-id>')
      process.exit(1)
    }
    if (!/^[a-z0-9-]+$/.test(appId)) {
      console.error('Error: app-id must be lowercase alphanumeric with hyphens only')
      process.exit(1)
    }
    init(appId)
    break
  }
  case 'generate': {
    const appId = args[0]
    const entity = args[1]
    if (!appId || !entity) {
      console.error('Usage: crud generate <app-id> <entity>')
      process.exit(1)
    }
    if (!/^[a-z]+$/.test(entity)) {
      console.error('Error: entity name must be lowercase letters only')
      process.exit(1)
    }
    generate(appId, entity)
    break
  }
  default:
    console.log('Usage:')
    console.log('  crud init <app-id>          Create a new app')
    console.log('  crud generate <app-id> <entity>  Add CRUD for an entity')
    process.exit(1)
}
