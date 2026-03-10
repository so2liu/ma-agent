---
name: web-app
description: Generate deployable web applications. Use when user asks to create web apps, forms, registration systems, dashboards, or any LAN-accessible tools.
license: MIT
---

# Web App Skill

When a user asks you to create a web application, use the `crud` CLI tool to scaffold the app and generate CRUD entities, then customize the generated code.

## Step 1: Initialize the App

```bash
bun run .claude/tools/crud.ts init <app-id>
```

- `app-id`: lowercase English + hyphens (e.g., `hotel-registration`)
- This creates the full project skeleton under `apps/<app-id>/`

Then edit `apps/<app-id>/app.json` to set the display name and icon:

```json
{
  "name": "Display Name (can be Chinese)",
  "description": "Short description",
  "version": "1.0.0",
  "icon": "emoji icon"
}
```

## Step 2: Generate CRUD Entities

For each data entity your app needs:

```bash
bun run .claude/tools/crud.ts generate <app-id> <entity>
```

- `entity`: singular lowercase name (e.g., `submission`, `user`, `comment`)
- This creates: database table, API routes, and a page component

You can generate multiple entities:

```bash
bun run .claude/tools/crud.ts generate hotel-registration guest
bun run .claude/tools/crud.ts generate hotel-registration room
```

## Step 3: Customize the Generated Code

After generating entities, you only need to edit these files:

### `src/db/schema.ts` — Add fields to tables

The generated table has `id` and `createdAt` by default. Add your fields:

```typescript
export const submissions = sqliteTable('submissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  // Add your fields:
  name: text('name').notNull(),
  stayType: text('stay_type').notNull(),
})
```

Common field types:

```typescript
text('field_name')                    // String
text('field_name').notNull()          // Required string
integer('field_name')                 // Number
text('field_name').default('value')   // String with default
```

### `src/pages/<Entity>Page.tsx` — Customize the UI

The generated page has a form and list with TODO placeholders. Replace them:

**Form fields** — add inside the `<form>`:

```tsx
<div>
  <label className="mb-1 block text-sm font-medium text-gray-700">姓名</label>
  <input
    type="text"
    value={form.name ?? ''}
    onChange={(e) => setForm({ ...form, name: e.target.value })}
    className="w-full rounded-lg border border-gray-300 px-3 py-2"
    placeholder="请输入姓名"
  />
</div>
```

**List items** — replace the `JSON.stringify(item)` with:

```tsx
<span className="text-gray-900">{item.name} - {item.stayType}</span>
```

### `src/server/routes/<entities>.ts` — Add custom business logic (optional)

The generated CRUD routes work out of the box. Only edit if you need custom validation, filtering, or business rules.

### `index.html` — Update the page title (optional)

Change the `<title>` tag to match your app name.

## What NOT to Do

- Do NOT create `package.json`, `vite.config.ts`, `tsconfig.json`, `drizzle.config.ts` — these are created by `crud init`
- Do NOT create `src/main.tsx`, `src/index.css`, `src/db/index.ts`, `src/server/index.ts` — these are managed by the CLI
- Do NOT modify files in `src/server/index.ts` imports section (the `// [crud:imports]` and `// [crud:routes]` markers are used by the CLI)

## Available Libraries

These are pre-installed and can be imported:

- **React 19** — `import { useState, useEffect } from 'react'`
- **Tailwind CSS 4** — use utility classes directly in JSX
- **@tanstack/react-query** — `import { useQuery, useMutation } from '@tanstack/react-query'`
- **Hono** — `import { Hono } from 'hono'` (backend routes)
- **Drizzle ORM** — `import { eq } from 'drizzle-orm'` (database queries)

## After Generating Files

Tell the user:

- The app files have been generated
- They can find the app card in the sidebar under "My Apps"
- Click **"Dev"** to start the development server with hot reload
- Click **"Build & Publish"** or **"Publish"** to build for production and share via LAN
- Share the generated LAN URL with colleagues
