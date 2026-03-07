---
name: web-app
description: Generate deployable web applications. Use when user asks to create web apps, forms, registration systems, dashboards, or any LAN-accessible tools.
license: MIT
---

# Web App Skill

When a user asks you to create a web application, generate files following these conventions.

## File Structure

Write all files to `apps/{app-name}/` under the workspace root.
Use lowercase English + hyphens for `{app-name}` (e.g., `hotel-registration`).

Each app requires these files:

### 1. `app.json` — App manifest

```json
{
  "name": "Display Name (can be Chinese)",
  "description": "Short description of the app",
  "version": "1.0.0",
  "icon": "emoji icon"
}
```

### 2. `src/App.tsx` — Frontend (React component)

This is the main React component rendered by the platform.

Requirements:

- Write a single `App.tsx` component as the default export
- Use **Tailwind CSS 4** utility classes for styling (imported via `@import 'tailwindcss'` in the template's `index.css`)
- Use **@tanstack/react-query** for data fetching (the `QueryClientProvider` is already set up in the template)
- All API calls use `/api/` prefix (e.g., `fetch('/api/items')`)
- Mobile-first responsive design (users may open on phones)
- Chinese UI by default (unless user specifies otherwise)
- No external CDN dependencies (LAN may have no internet)
- You may create additional components as separate files under `src/` and import them

Example:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

export default function App() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const { data: items = [] } = useQuery({
    queryKey: ['items'],
    queryFn: () => fetch('/api/items').then((r) => r.json())
  });

  const addItem = useMutation({
    mutationFn: (newItem: { name: string }) =>
      fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['items'] })
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <h1 className="text-2xl font-bold text-gray-900">My App</h1>
      {/* ... */}
    </div>
  );
}
```

### 3. `server.js` — Backend logic (runs in QuickJS WASM sandbox)

Requirements:

- Export a `handleRequest(req)` function as the entry point
- Only use the sandbox-provided global APIs (see below)
- Do NOT use fetch, fs, require, import, or any Node.js/browser APIs

#### Sandbox Global APIs

```javascript
// Data storage (auto-persisted to JSON file by host)
DB.getAll(); // Returns all records as array
DB.getById(id); // Returns record or null
DB.insert(record); // Returns record with auto-generated id + createdAt
DB.update(id, partialRecord); // Returns true/false
DB.remove(id); // Returns true/false
DB.query({ field: value }); // Returns matching records

// Logging
Logger.info(message);
Logger.error(message);
```

#### handleRequest Signature

```javascript
/**
 * @param {Object} req
 * @param {string} req.method  - "GET" | "POST" | "PUT" | "DELETE"
 * @param {string} req.path    - e.g., "/api/registrations"
 * @param {Object} req.headers - HTTP request headers
 * @param {string|null} req.body - Request body (JSON string)
 *
 * @returns {Object} response
 * @returns {number} response.status  - HTTP status code
 * @returns {Object} response.headers - Response headers
 * @returns {string} response.body    - Response body string
 */
function handleRequest(req) {
  // Route handling here...
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  };
}
```

## What NOT to Write

The platform automatically provides these files from a template — do NOT create them:

- `package.json` — auto-generated with React, Tailwind, TanStack Query, Vite
- `vite.config.ts` — auto-configured with React plugin, Tailwind, API proxy
- `tsconfig.json` — auto-configured for React + TypeScript
- `index.html` — auto-generated entry point that loads `src/main.tsx`
- `src/main.tsx` — auto-generated with React root + QueryClientProvider
- `src/index.css` — auto-generated with Tailwind import

## Available Libraries

These are pre-installed in every app and can be imported in `src/App.tsx`:

- **React 19** — `import { useState, useEffect } from 'react'`
- **Tailwind CSS 4** — use utility classes directly in JSX
- **@tanstack/react-query** — `import { useQuery, useMutation } from '@tanstack/react-query'`

## After Generating Files

Tell the user:

- The app files have been generated
- They can find the app card in the sidebar under "My Apps"
- Click **"Dev"** to start the development server with hot reload
- Click **"Build & Publish"** or **"Publish"** to build for production and share via LAN
- Share the generated LAN URL with colleagues
