
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Navigation Patterns

Detail views (e.g., ServerDetailView, ContainerDetailView, TaskDetailView) must follow this pattern:

1. **Back button and entity name go in the App.tsx header**, not in the detail view component
2. Detail view components should NOT have an `onBack` prop or render their own back buttons
3. The header in `App.tsx` handles showing:
   - The back button (using `ChevronLeft` icon)
   - The entity name (e.g., server name, container name)
   - Status badges
   - Breadcrumb text (e.g., "Servers", "Containers")

Example of the CORRECT pattern (from App.tsx header):
```tsx
) : selectedServerId && selectedServer ? (
  <>
    <Button variant="outline" size="icon-sm" onClick={() => setSelectedServerId(null)} className="mr-component">
      <ChevronLeft size={20} />
    </Button>
    <div className="min-w-0 flex-1">
      <h2 className="text-sm font-bold text-foreground">{selectedServer.name}</h2>
      <div className="text-[10px] text-muted-foreground uppercase">Servers</div>
    </div>
  </>
)
```

Do NOT use `DetailViewLayout` props like `onBack`, `backText`, or `title` for navigation - these create duplicate back buttons and incorrect nav bar content.

## Detail Page Layout Pattern

All detail pages (TaskDetailView, ContainerDetailView, ServerDetailView, SettingsView) must follow this consistent layout pattern:

### Root Structure

```tsx
<div className="flex flex-col h-full bg-background animate-in fade-in duration-300">
  <div className="flex-1 flex overflow-hidden">
    <div className="flex-1 overflow-y-auto min-w-0">
      <div className="px-page pt-section shrink-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* ... */}
        </Tabs>
      </div>
    </div>
  </div>
</div>
```

### Tabs

```tsx
<TabsList className="w-full justify-start">
  <TabsTrigger value="overview" className="flex items-center">
    <Info size={14} className="mr-1.5" />
    Overview
  </TabsTrigger>
  {/* More tabs... */}
</TabsList>
```

- TabsList: `className="w-full justify-start"`
- TabsTrigger: `className="flex items-center"` with icon (size={14}) and `mr-1.5` margin

### Tab Content Area

```tsx
<div className="py-6">
  <TabsContent value="overview" className="!mt-0">
    <div className="space-y-8">
      {/* Sections */}
    </div>
  </TabsContent>
</div>
```

- Wrapper: `py-6` padding
- TabsContent: `className="!mt-0"` to override default margin
- Section container: `space-y-8` between sections

### Section Headers

```tsx
<section>
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
    <IconName size={16} className="mr-2" /> Section Title
  </h3>
  <div className="bg-surface border border-border rounded-lg p-4">
    {/* Content */}
  </div>
</section>
```

- Always use `<section>` wrapper
- Header: `h3` with `text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center`
- Icon: `size={16}` with `mr-2` margin
- Panel: `bg-surface border border-border rounded-lg p-4` (NOT `rounded-xl`)

### Field Labels Inside Panels

```tsx
<label className="text-xs text-muted-foreground uppercase font-semibold">
  Field Name
</label>
```

### Key Rules

1. **Use `rounded-lg`** for panels, NOT `rounded-xl`
2. **Section headers are uppercase** with muted-foreground color and tracking-wider
3. **Icons in headers** are size={16}, icons in tabs are size={14}
4. **Use `space-y-8`** between sections, `space-y-4` or `space-y-6` within panels
5. **All detail pages should have tabs** organized by content type (Overview, Logs, etc.)
6. **Do NOT use DetailViewLayout** - use the direct pattern above instead
