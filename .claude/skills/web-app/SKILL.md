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

### 2. `index.html` — Frontend (single file with inline CSS + JS)

Requirements:

- Single HTML file with all CSS and JS inlined
- Mobile-first responsive design (users may open on phones)
- All API calls use `/api/` prefix
- No external CDN dependencies (LAN may have no internet)
- Chinese UI by default (unless user specifies otherwise)
- Include proper `<meta charset="UTF-8">` and viewport meta

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

**IMPORTANT:** `req.path` includes the `/api/` prefix (e.g., `/api/todos`, `/api/todos/123`).
Strip the prefix before routing:

```javascript
function handleRequest(req) {
  var method = req.method;
  // Strip /api prefix so "/api/todos/123" becomes "/todos/123"
  var path = req.path.replace(/^\/api/, '');
  var parts = path.split('/').filter(Boolean); // ["todos", "123"]

  if (parts[0] === 'todos') {
    if (method === 'GET' && parts.length === 1) {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DB.getAll())
      };
    }
    // ... more routes
  }

  return {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
    body: '{"error":"Not Found"}'
  };
}
```

## After Generating Files

Tell the user:

- The app files have been generated
- They can find the app card in the sidebar under "My Apps"
- Click "Publish to LAN" to start the server
- Share the generated LAN URL with colleagues
