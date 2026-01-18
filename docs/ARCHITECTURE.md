# Backend Architecture

This document describes the architectural design decisions for the Agent Manager backend, specifically the choice to use Convex as the serverless database and function platform.

## Why Convex?

### Decision Rationale

We evaluated several backend options for this project:

| Option | Pros | Cons |
|--------|------|------|
| **Traditional REST API** (Express/Fastify + PostgreSQL) | Familiar, full control | More boilerplate, manual real-time setup, deployment complexity |
| **Firebase/Firestore** | Real-time built-in, managed | NoSQL limitations, vendor lock-in, complex querying |
| **Supabase** | PostgreSQL, real-time, auth | Real-time has limitations, requires more setup |
| **Convex** | Real-time native, TypeScript-first, automatic caching | Newer platform, learning curve |

**Convex was selected for these key reasons:**

1. **Native Real-time Subscriptions**: Every query automatically becomes a real-time subscription. When data changes, all connected clients update instantly without any additional code.

2. **TypeScript End-to-End**: Schema, functions, and client code are all TypeScript with full type inference. The generated `api` object provides complete type safety from database to UI.

3. **Transactional Consistency**: All mutations are ACID transactions. No need to worry about race conditions or partial updates.

4. **Automatic Caching & Deduplication**: Convex automatically caches query results and deduplicates identical queries across components.

5. **Serverless Functions**: Queries, mutations, actions, and HTTP endpoints all deploy together with zero configuration.

6. **Built-in Scheduling**: Cron jobs and one-off scheduled functions are first-class features.

### Trade-offs Accepted

- **Vendor Lock-in**: Convex is a proprietary platform. Migrating away would require rewriting the backend.
- **NoSQL Model**: While Convex supports relational patterns via foreign keys, it's not a traditional SQL database.
- **Cold Starts**: Like all serverless platforms, there can be cold start latency (mitigated by Convex's architecture).

## Database Schema Design

The schema normalizes the frontend's nested data structures into separate tables with proper relationships.

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌──────────────────┐
│  projects   │───┬──▶│    tasks    │───┬──▶│acceptanceCriteria│
└─────────────┘   │   └─────────────┘   │   └──────────────────┘
                  │          │          │
                  │          │          └──▶┌─────────────┐
                  │          │              │    tests    │
                  │          │              └─────────────┘
                  │          │
                  │          ├─────────────▶┌─────────────────┐
                  │          │              │ taskDependencies│
                  │          │              └─────────────────┘
                  │          │
                  │          └─────────────▶┌─────────────────┐
                  │                         │  pullRequests   │
                  │                         └─────────────────┘
                  │                                │
                  │                    ┌───────────┼───────────┐
                  │                    ▼           ▼           ▼
                  │              ┌──────────┐┌──────────┐┌──────────┐
                  │              │prComments││ prIssues ││ prChecks │
                  │              └──────────┘└──────────┘└──────────┘
                  │
                  └────────────────────────▶┌─────────────────┐
                                            │  chatMessages   │
                                            └─────────────────┘

┌─────────────┐       ┌─────────────┐       ┌─────────────────┐
│   servers   │──────▶│ containers  │       │  serverMetrics  │
└─────────────┘       └─────────────┘       └─────────────────┘
       │
       └──────────────────────────────────────────▲

┌─────────────────┐       ┌─────────────┐
│  webhookEvents  │       │  agentJobs  │
└─────────────────┘       └─────────────┘
```

### Table Purposes

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `projects` | Software project metadata and specifications | Parent of tasks, chatMessages |
| `tasks` | Individual work items with status tracking | Belongs to project, has criteria/tests/PR |
| `taskDependencies` | Many-to-many task dependency relationships | Links tasks to dependent tasks |
| `acceptanceCriteria` | Checklist items for task completion | Belongs to task |
| `tests` | Test results and status tracking | Belongs to task |
| `chatMessages` | AI/user conversation history | Belongs to project OR task |
| `historyEvents` | Audit trail of all actions | Links to project and/or task |
| `pullRequests` | GitHub PR metadata and review status | Belongs to task |
| `prComments` | Comments on pull requests | Belongs to pullRequest |
| `prIssues` | AI-detected code issues | Belongs to pullRequest |
| `prChecks` | CI/CD check results | Belongs to pullRequest |
| `servers` | Server infrastructure records | Parent of containers, metrics |
| `containers` | Docker container instances | Belongs to server |
| `serverMetrics` | Time-series performance data | Belongs to server |
| `webhookEvents` | Incoming webhook storage for processing | Standalone |
| `agentJobs` | AI agent job tracking | Belongs to task |

### Index Strategy

Every table has indexes optimized for common query patterns:

```typescript
// Example: tasks table indexes
tasks: defineTable({...})
  .index("by_project", ["projectId"])                    // List tasks by project
  .index("by_project_and_category", ["projectId", "category"]) // Kanban columns
  .index("by_category", ["category"])                    // Filter by status
```

**Index Design Principles:**
- Index all foreign key fields for efficient joins
- Create compound indexes for common filter combinations
- Use timestamp indexes for time-range queries (metrics, history)

## Function Architecture

### Function Types

Convex provides four function types, each with specific use cases:

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                   │
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │  query   │        │ mutation │        │httpAction│
    │(read-only│        │  (read/  │        │  (HTTP   │
    │subscribe)│        │  write)  │        │endpoints)│
    └──────────┘        └──────────┘        └──────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌─────────────────────────────────────────────────┐
    │                   DATABASE                       │
    └─────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────┐
    │              INTERNAL FUNCTIONS                  │
    │  ┌──────────────┐  ┌──────────────┐            │
    │  │internalQuery │  │internalMutation│           │
    │  └──────────────┘  └──────────────┘            │
    │  ┌──────────────┐  ┌──────────────┐            │
    │  │internalAction│  │  scheduler   │            │
    │  │ (external API│  │  (delayed    │            │
    │  │    calls)    │  │  execution)  │            │
    │  └──────────────┘  └──────────────┘            │
    └─────────────────────────────────────────────────┘
```

| Type | Purpose | Can Read DB | Can Write DB | Exposed to Client |
|------|---------|-------------|--------------|-------------------|
| `query` | Read data, auto-subscribes | Yes | No | Yes |
| `mutation` | Write data, transactional | Yes | Yes | Yes |
| `action` | External API calls | Via scheduler | Via scheduler | Yes |
| `httpAction` | HTTP endpoints | Via scheduler | Via scheduler | No (HTTP only) |
| `internalQuery` | Internal read helpers | Yes | No | No |
| `internalMutation` | Internal write helpers | Yes | Yes | No |
| `internalAction` | Background processing | Via scheduler | Via scheduler | No |

### File Organization

```
convex/
├── schema.ts              # Database schema definition
├── http.ts                # HTTP webhook endpoints
├── crons.ts               # Scheduled jobs
│
├── projects.ts            # Public project API
├── tasks.ts               # Public task API
├── acceptanceCriteria.ts  # Public criteria API
├── tests.ts               # Public test API
├── chat.ts                # Public chat API
├── pullRequests.ts        # Public PR API
├── servers.ts             # Public server API
├── containers.ts          # Public container API
├── webhooks.ts            # Webhook event storage
│
└── internal/              # Internal functions (not exposed to client)
    ├── aiResponses.ts     # AI processing and response generation
    ├── history.ts         # Audit trail recording
    ├── webhookProcessing.ts # Async webhook handlers
    └── metrics.ts         # Metrics recording and cleanup
```

**Organization Principles:**
- One file per domain entity for public APIs
- Internal functions grouped by capability, not entity
- `internal/` directory prefix makes functions inaccessible to clients

## Real-time Subscription Pattern

### How It Works

```typescript
// Frontend: Component automatically re-renders when data changes
const tasks = useQuery(api.tasks.listByProject, { projectId });

// Backend: Standard query function
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_project", q => q.eq("projectId", args.projectId))
      .collect();
  },
});
```

When any client calls a mutation that modifies the `tasks` table, all clients subscribed to queries touching that data automatically receive updates. No WebSocket setup, no manual invalidation.

### Subscription Lifecycle

```
1. Component mounts
   └─▶ useQuery() called
       └─▶ Query executed on server
           └─▶ Result cached and returned
               └─▶ Subscription established

2. Another client mutates data
   └─▶ Convex detects affected queries
       └─▶ Re-executes queries
           └─▶ Pushes new results to subscribers
               └─▶ React components re-render
```

## Webhook Processing Architecture

External systems (GitHub, CI/CD, agents) send webhooks that need reliable processing.

### Design: Store-Then-Process

```
┌──────────┐     ┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│  GitHub  │────▶│ HTTP Action │────▶│ webhookEvents   │────▶│ Scheduled    │
│  Webhook │     │ (http.ts)   │     │ (store event)   │     │ Processing   │
└──────────┘     └─────────────┘     └─────────────────┘     └──────────────┘
                                                                     │
                                                                     ▼
                                                             ┌──────────────┐
                                                             │ Update DB    │
                                                             │ (tasks, PRs) │
                                                             └──────────────┘
```

**Why Store-Then-Process?**

1. **Reliability**: Webhook is acknowledged immediately (200 OK), processing can fail and retry
2. **Idempotency**: Duplicate webhooks are detected by stored event ID
3. **Debugging**: All webhook payloads are stored for inspection
4. **Rate Limiting**: Processing can be throttled independently of ingestion

### Processing Flow

```typescript
// http.ts - HTTP endpoint receives webhook
const handler = httpAction(async (ctx, request) => {
  const body = await request.json();

  // 1. Store the raw event
  await ctx.runMutation(internal.webhooks.store, {
    source: "github",
    payload: JSON.stringify(body),
    status: "pending",
  });

  // 2. Schedule async processing
  await ctx.scheduler.runAfter(0, internal.internal.webhookProcessing.processGithubWebhook, {
    eventId,
  });

  return new Response("OK", { status: 200 });
});
```

### Retry Logic

Failed webhook processing is retried via cron job:

```typescript
// crons.ts
crons.interval(
  "retry_failed_webhooks",
  { minutes: 5 },
  internal.internal.webhookProcessing.retryFailedWebhooks,
  { maxRetries: 3 }
);
```

## Internal Function Patterns

### Audit Trail Recording

All significant actions are logged via internal history functions:

```typescript
// internal/history.ts
export const recordEvent = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    action: v.string(),
    user: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("historyEvents", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// Usage in a mutation
export const updateCategory = mutation({
  // ...
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { category: args.category });

    // Record the action
    await ctx.scheduler.runAfter(0, internal.internal.history.recordEvent, {
      taskId: args.id,
      action: `Moved to ${args.category}`,
      user: "system",
    });
  },
});
```

### AI Response Generation

AI processing uses actions (for external API calls) with mutations (for DB writes):

```typescript
// internal/aiResponses.ts
export const generateChatResponse = internalAction({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    // 1. Load context
    const context = await ctx.runQuery(internal.internal.aiResponses.loadChatContext, {
      messageId: args.messageId,
    });

    // 2. Call external AI API
    const response = await fetch("https://api.anthropic.com/...", {...});
    const aiMessage = await response.json();

    // 3. Write response to DB
    await ctx.runMutation(internal.internal.aiResponses.writeChatResponse, {
      originalMessageId: args.messageId,
      text: aiMessage.content,
    });
  },
});
```

## Cron Jobs

Scheduled tasks handle maintenance and retry logic:

| Job | Interval | Purpose |
|-----|----------|---------|
| `cleanup_old_metrics` | 6 hours | Remove server metrics older than 7 days |
| `cleanup_old_history` | 24 hours | Remove history events older than 30 days |
| `retry_failed_webhooks` | 5 minutes | Retry failed webhook processing |

```typescript
// crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup_old_metrics",
  { hours: 6 },
  internal.internal.metrics.cleanupOldMetrics,
  { olderThanDays: 7 }
);

export default crons;
```

## Frontend Integration

### Provider Setup

```typescript
// frontend.tsx
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(convexUrl);

<ConvexProvider client={convex}>
  <App />
</ConvexProvider>
```

### Query Usage

```typescript
// Component.tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function TaskList({ projectId }) {
  // Auto-subscribing query
  const tasks = useQuery(api.tasks.listByProject, { projectId });

  // Mutation hook
  const createTask = useMutation(api.tasks.create);

  const handleAdd = async (title) => {
    await createTask({ projectId, title, category: "backlog" });
    // No need to refetch - subscription handles it!
  };

  if (tasks === undefined) return <Loading />;
  return <TaskGrid tasks={tasks} onAdd={handleAdd} />;
}
```

### Type Safety

The generated `api` object provides full type inference:

```typescript
// Argument types are inferred from schema validators
const task = useQuery(api.tasks.get, {
  id: taskId  // TypeScript knows this must be Id<"tasks">
});

// Return types are inferred from handler return
task?.title  // TypeScript knows task has title: string
```

## Deployment

### Development

```bash
bunx convex dev  # Watches files, auto-deploys to dev environment
```

### Production

```bash
bunx convex deploy  # Deploys to production environment
```

### Environment Management

Convex manages separate dev/prod environments automatically. Environment variables are set via dashboard or CLI:

```bash
bunx convex env set API_KEY "secret-value"
```

## Monitoring & Debugging

### Convex Dashboard

Access via `bunx convex dashboard` for:
- Real-time function logs
- Database browser and editor
- Query performance metrics
- Error tracking

### Logging

```typescript
// Functions can log for debugging
export const myMutation = mutation({
  handler: async (ctx, args) => {
    console.log("Processing:", args);  // Visible in dashboard
    // ...
  },
});
```

## Future Considerations

### Potential Enhancements

1. **Full-text Search**: Convex supports full-text search indexes for finding tasks/projects
2. **File Storage**: Convex has built-in file storage for attachments
3. **Authentication**: Integrate Clerk or Auth0 for user authentication
4. **Rate Limiting**: Add rate limiting to webhook endpoints

### Migration Path

If migrating away from Convex becomes necessary:
1. Export data via Convex dashboard or API
2. Schema maps relatively cleanly to PostgreSQL
3. Replace `useQuery`/`useMutation` with React Query + REST API
4. Implement WebSocket layer for real-time (e.g., Socket.io)
