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

### Hybrid Architecture: Bun + Convex

For the agent system, we use a hybrid approach:

- **Agent Gateway (Bun WebSocket Server)**: Handles long-running WebSocket connections with containers. Convex has execution time limits that make it unsuitable for streaming CLI output.
- **Convex Backend**: Stores session data, messages, and provides real-time subscriptions to the frontend.

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│    Frontend     │◀────▶│     Convex      │◀────▶│  Agent Gateway  │
│   (React 19)    │      │  (persistence)  │      │  (Bun WebSocket)│
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                                          │
                                                          ▼
                                               ┌─────────────────┐
                                               │   Containers    │
                                               │ (Claude Code)   │
                                               └─────────────────┘
```

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
                  │          ├─────────────▶┌─────────────────┐
                  │          │              │   taskPhases    │
                  │          │              │ (phase tracking)│
                  │          │              └─────────────────┘
                  │          │
                  │          ├─────────────▶┌─────────────────────┐
                  │          │              │ remediationCycles   │
                  │          │              │ (fix cycle history) │
                  │          │              └─────────────────────┘
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

┌─────────────────┐
│  phaseConfigs   │──────▶ tasks (optional, for per-task overrides)
│ (agent config)  │
└─────────────────┘

┌─────────────┐       ┌─────────────┐       ┌─────────────────┐
│   servers   │──────▶│ containers  │       │  serverMetrics  │
└─────────────┘       └─────────────┘       └─────────────────┘
       │
       └──────────────────────────────────────────▲

┌─────────────────┐       ┌─────────────┐
│  webhookEvents  │       │  agentJobs  │
└─────────────────┘       └─────────────┘

┌─────────────────┐       ┌─────────────────┐
│ agentSessions   │──────▶│ agentMessages   │
│ (CLI sessions)  │       │ (streaming out) │
└─────────────────┘       └─────────────────┘
       │
       ├──────────────────▶ projects (optional)
       └──────────────────▶ tasks (optional)

┌─────────────────┐       ┌─────────────────────┐
│containerBuilds  │──────▶│containerBuildPhases │
│ (build sessions)│       │  (phase tracking)   │
└─────────────────┘       └─────────────────────┘
```

### Table Purposes

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `projects` | Software project metadata and specifications | Parent of tasks, chatMessages, agentSessions |
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
| `containers` | Docker container instances | Belongs to server, may have Tailscale info |
| `serverMetrics` | Time-series performance data | Belongs to server |
| `webhookEvents` | Incoming webhook storage for processing | Standalone |
| `agentJobs` | AI agent job tracking | Belongs to task |
| `agentSessions` | Claude Code CLI sessions via gateway | Belongs to container, optionally task/project |
| `agentMessages` | Streaming output from CLI sessions | Belongs to agentSession |
| `containerBuilds` | Container build session tracking | Links to container by containerId |
| `containerBuildPhases` | Individual build phase logs | Belongs to containerBuild |
| `taskPhases` | Task lifecycle phase tracking | Belongs to task, tracks each phase execution |
| `phaseConfigs` | Agent configuration per phase | Global defaults (taskId=null) or task overrides |
| `remediationCycles` | Remediation fix cycle history | Belongs to task, tracks each fix attempt |

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
packages/convex/
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
├── agentSessions.ts       # Agent CLI session tracking
├── agentMessages.ts       # Streaming output storage
│
└── internal/              # Internal functions (not exposed to client)
    ├── aiResponses.ts     # AI processing and response generation
    ├── history.ts         # Audit trail recording
    ├── webhookProcessing.ts # Async webhook handlers
    └── metrics.ts         # Metrics recording and cleanup

packages/agent-gateway/    # Bun WebSocket server
├── src/
│   ├── index.ts           # Server entry point
│   ├── connections.ts     # Container connection management
│   ├── convex-sync.ts     # Convex integration
│   ├── claude-auth.ts     # One-time OAuth token setup via PTY
│   ├── phase-prompts.ts   # Phase prompt templates for all 6 phases
│   └── task-orchestrator.ts # Task execution orchestration
└── bin/
    └── create-agent       # Container creation script

packages/container-api/    # Runs inside containers
├── src/
│   ├── index.ts           # Elysia HTTP server
│   ├── process-manager.ts # Claude CLI management
│   ├── manager-connection.ts # Gateway WebSocket client
│   └── auth-manager.ts    # OAuth flow handling

packages/agent-shared/     # Shared types
└── src/
    └── index.ts           # WebSocket protocol types
```

**Organization Principles:**
- One file per domain entity for public APIs
- Internal functions grouped by capability, not entity
- `internal/` directory prefix makes functions inaccessible to clients

## Task Phase System Architecture

The Task Phase System provides formal lifecycle management for tasks, with configurable AI agents handling each phase.

### Phase Lifecycle

Tasks progress through seven phases, each with its own agent configuration:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TASK PHASE LIFECYCLE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌──────────┐    ┌────────────────┐    ┌───────────┐    │
│  │ Requirements│───▶│ Planning │───▶│ Implementation │───▶│ AI Review │    │
│  │  (manual)   │    │ (agent)  │    │    (agent)     │    │  (agent)  │    │
│  └─────────────┘    └──────────┘    └────────────────┘    └───────────┘    │
│                                                                  │          │
│                           ┌──────────────────────────────────────┤          │
│                           │                                      │          │
│                           ▼                                      ▼          │
│                    ┌─────────────┐                      ┌──────────────┐   │
│  ┌────────────────▶│ Remediation │◀─────────────────────│ Human Review │   │
│  │                 │   (agent)   │   request changes    │   (agent)    │   │
│  │                 └─────────────┘                      └──────────────┘   │
│  │                        │                                    │           │
│  │ validation loop        │ completed                          │ approved  │
│  │                        ▼                                    │           │
│  │                 ┌───────────┐                               │           │
│  └─────────────────│ AI Review │                               │           │
│                    └───────────┘                               │           │
│                           │                                    │           │
│                           │ approved                           │           │
│                           ▼                                    ▼           │
│                    ┌──────────────┐                     ┌───────────┐      │
│                    │ Human Review │────────────────────▶│   Merge   │      │
│                    └──────────────┘     approved        │  (agent)  │      │
│                                                         └───────────┘      │
│                                                                │           │
│                                                                ▼           │
│                                                         ┌───────────┐      │
│                                                         │ Completed │      │
│                                                         └───────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase Table Schema

```typescript
taskPhases: defineTable({
  taskId: v.id("tasks"),
  phase: v.union(
    v.literal("requirements"),
    v.literal("planning"),
    v.literal("implementation"),
    v.literal("ai_review"),
    v.literal("remediation"),
    v.literal("human_review"),
    v.literal("merge")
  ),
  status: v.union(
    v.literal("pending"),
    v.literal("in_progress"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("skipped")
  ),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  // Agent configuration used for this execution
  provider: v.optional(v.string()),
  model: v.optional(v.string()),
  prompt: v.optional(v.string()),
  permissionMode: v.optional(v.string()),
  // Results
  result: v.optional(v.string()),
  error: v.optional(v.string()),
  // References
  agentSessionId: v.optional(v.string()),
  containerId: v.optional(v.string()),
  // Cost tracking
  totalCostUsd: v.optional(v.number()),
  numTurns: v.optional(v.number()),
  // Remediation tracking (for remediation phase only)
  currentRemediationCycle: v.optional(v.number()),
  remediationTriggeredBy: v.optional(v.union(
    v.literal("ai_review"),
    v.literal("human_review")
  )),
  order: v.number(),  // 0-6 for phase ordering
})
  .index("by_task", ["taskId"])
  .index("by_task_and_phase", ["taskId", "phase"])
```

### Phase Configuration Schema

```typescript
phaseConfigs: defineTable({
  taskId: v.optional(v.id("tasks")), // null = global default
  phase: v.union(
    v.literal("planning"),
    v.literal("implementation"),
    v.literal("ai_review"),
    v.literal("remediation"),
    v.literal("human_review"),
    v.literal("merge")
  ),
  provider: v.string(),           // e.g., "anthropic"
  model: v.string(),              // e.g., "claude-sonnet-4-20250514"
  permissionMode: v.string(),     // "default", "plan", "accept_edits", "full_auto"
  promptTemplate: v.string(),     // Prompt with {{variable}} placeholders
  systemPrompt: v.optional(v.string()),
  maxBudgetUsd: v.optional(v.number()),
  maxRemediationCycles: v.optional(v.number()), // Only for remediation phase
  enabled: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_phase", ["phase"])
  .index("by_task_and_phase", ["taskId", "phase"])
```

### Remediation Cycles Schema

```typescript
remediationCycles: defineTable({
  taskId: v.id("tasks"),
  cycleNumber: v.number(),        // 1, 2, 3, etc.
  triggeredBy: v.union(
    v.literal("ai_review"),
    v.literal("human_review")
  ),
  feedback: v.optional(v.string()), // Human feedback when triggered by human_review
  status: v.union(
    v.literal("pending"),
    v.literal("in_progress"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("skipped")
  ),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  // Agent session details
  provider: v.optional(v.string()),
  model: v.optional(v.string()),
  prompt: v.optional(v.string()),
  permissionMode: v.optional(v.string()),
  result: v.optional(v.string()),
  error: v.optional(v.string()),
  agentSessionId: v.optional(v.string()),
  containerId: v.optional(v.string()),
  totalCostUsd: v.optional(v.number()),
  numTurns: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_task", ["taskId"])
  .index("by_task_and_cycle", ["taskId", "cycleNumber"])
```

### Phase Transition Logic

Phase transitions are managed by `internal/phaseTransitions.ts`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE TRANSITION RULES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Valid Transitions:                                                          │
│  ─────────────────                                                          │
│  requirements    → planning                                                  │
│  planning        → implementation                                            │
│  implementation  → ai_review                                                 │
│  ai_review       → remediation (issues found)                               │
│                  → human_review (approved)                                   │
│  remediation     → ai_review (always, for validation)                       │
│  human_review    → remediation (changes requested)                          │
│                  → merge (approved)                                          │
│  merge           → completed                                                 │
│                                                                              │
│  Remediation Loop:                                                          │
│  ─────────────────                                                          │
│  1. AI Review finds issues  → triggerRemediationFromAIReview()              │
│  2. Human requests changes  → triggerRemediationFromHumanReview(feedback)   │
│  3. Remediation completes   → completeRemediationCycle() → AI Review        │
│  4. AI Review validates     → approveAIReview() → Human Review              │
│                             → (or back to remediation if more issues)       │
│                                                                              │
│  Max Cycles:                                                                │
│  ───────────                                                                │
│  When maxRemediationCycles reached, escalate to human_review               │
│  to decide next steps (default limit: 3 cycles)                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Transition Functions

| Function | Trigger | Effect |
|----------|---------|--------|
| `startPhase(taskId, phase)` | Manual or auto | Begin a phase, create container |
| `completePhase(taskId, phase, result)` | Agent completion | Mark phase done, destroy container |
| `failPhase(taskId, phase, error)` | Agent error | Mark phase failed |
| `triggerRemediationFromAIReview(taskId)` | AI Review finds issues | Start remediation cycle |
| `triggerRemediationFromHumanReview(taskId, feedback)` | Human requests changes | Start remediation with feedback |
| `completeRemediationCycle(taskId, cycleNumber)` | Remediation agent done | Transition to AI Review for validation |
| `approveAIReview(taskId)` | AI Review approves | Transition to Human Review |
| `approveHumanReview(taskId)` | Human approves | Transition to Merge |

### Configuration Resolution

When starting a phase, the system resolves configuration in this order:

```
1. Task-specific override (phaseConfigs where taskId = task)
      ↓ (if not found)
2. Global default (phaseConfigs where taskId = null)
      ↓ (if not found)
3. Built-in default (hardcoded in phaseConfigs.ts)
```

This allows:
- **Global defaults** for consistent behavior across all tasks
- **Per-task overrides** for specific requirements
- **Built-in fallbacks** ensure the system always works

### Container Lifecycle Per Phase

Each agent phase creates a fresh Docker container:

```
Phase Start:
  1. Create container with unique name
  2. Clone repository and checkout branch
  3. Connect to gateway via WebSocket
  4. Start agent session with phase prompt

Phase Complete:
  1. Record session results and costs
  2. Update phase status
  3. Destroy container
  4. Trigger next phase transition
```

This isolation ensures:
- Clean environment for each phase
- No state contamination between phases
- Independent cost tracking per phase
- Parallel execution potential (future enhancement)

## Agent Gateway Architecture

The Agent Gateway (`packages/agent-gateway`) is a Bun WebSocket server that orchestrates communication between the frontend and agent containers running Claude Code CLI.

### Why a Separate Gateway?

Convex has execution time limits (~60 seconds for actions) that make it unsuitable for:
- Long-running WebSocket connections with containers
- Streaming CLI output that can run for minutes
- Managing stateful container connections

The gateway handles these real-time concerns and syncs results to Convex for persistence.

### Gateway Components

```
packages/agent-gateway/
├── src/
│   ├── index.ts           # Main server (Bun.serve with WebSocket)
│   ├── connections.ts     # ConnectionManager class
│   └── convex-sync.ts     # ConvexSync for persistence
└── bin/
    └── create-agent       # Container creation script
```

### Connection Flow

```
1. Container starts
   └─▶ Container API connects to gateway WebSocket
       └─▶ Sends "connect" message with containerId, hostname, capabilities
           └─▶ Gateway registers container in ConnectionManager
               └─▶ Syncs connection status to Convex

2. Frontend requests execution
   └─▶ POST /exec to gateway HTTP API
       └─▶ Gateway creates correlationId
           └─▶ Sends "exec:start" to container via WebSocket
               └─▶ Container runs Claude CLI with --print mode

3. Container streams output
   └─▶ "exec:stream" messages sent to gateway
       └─▶ Gateway syncs to Convex agentMessages table
           └─▶ Frontend subscribes to real-time updates

4. Execution completes
   └─▶ Container sends "exec:complete"
       └─▶ Gateway updates agentSessions status
           └─▶ Frontend sees completion via subscription
```

### ConnectionManager

Tracks all connected containers with health status:

```typescript
interface ContainerState {
  ws: ServerWebSocket<ContainerContext>;
  info: ConnectPayload;           // containerId, hostname, version, capabilities
  health?: StatusHealthPayload;   // system metrics, process counts
  connectedAt: number;
  lastHeartbeat: number;
}
```

Key methods:
- `registerContainer(ws, payload)` - Register new container connection
- `sendToContainer(containerId, type, payload)` - Send message to specific container
- `findAvailableContainer()` - Find container for new execution
- `pruneStaleConnections()` - Remove containers that stopped heartbeating

### Convex Sync

The `ConvexSync` class writes events to Convex:

```typescript
class ConvexSync {
  // Record execution start
  recordExecStart(correlationId, containerId, options, taskId?, projectId?)

  // Record streaming output
  recordStreamEvent(correlationId, containerId, payload, taskId?, projectId?)

  // Record completion
  recordExecComplete(correlationId, containerId, payload, taskId?, projectId?)

  // Update container connection status
  updateContainerConnection(containerId, hostname, connected)

  // Build tracking methods
  createBuild(containerId, request)        // Initialize build with all phases
  startPhase(containerId, phase)           // Mark phase as in_progress
  completePhase(containerId, phase, logs?) // Mark phase completed with logs
  failBuild(containerId, phase, error, logs?) // Mark build as failed
  appendLogs(containerId, phase, logs)     // Append logs to current phase
  skipPhase(containerId, phase)            // Skip a phase
}
```

## Task Execution Flow

When a user starts a task phase from the frontend, the system orchestrates execution through multiple components:

### Execution Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TASK EXECUTION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Frontend                 2. Gateway                  3. Container        │
│  ───────────                 ──────────                  ────────────        │
│                                                                              │
│  User clicks              TaskOrchestrator            Container API         │
│  "Start Phase"            receives request            runs Claude CLI       │
│       │                         │                           │               │
│       ▼                         ▼                           ▼               │
│  ┌──────────┐           ┌──────────────┐           ┌──────────────┐        │
│  │  Call    │──────────▶│   Fetch      │           │              │        │
│  │  Gateway │           │   Task/Proj  │           │              │        │
│  │  API     │           │   from Convex│           │              │        │
│  └──────────┘           └──────────────┘           │              │        │
│                                │                    │              │        │
│                                ▼                    │              │        │
│                         ┌──────────────┐           │              │        │
│                         │  Generate    │           │              │        │
│                         │  Phase Prompt│           │              │        │
│                         │  (templates) │           │              │        │
│                         └──────────────┘           │              │        │
│                                │                    │              │        │
│                                ▼                    │              │        │
│                         ┌──────────────┐           │              │        │
│                         │ Find/Assign  │           │              │        │
│                         │  Container   │           │              │        │
│                         └──────────────┘           │              │        │
│                                │                    │              │        │
│                                ▼                    ▼              │        │
│                         ┌──────────────┐    ┌──────────────┐      │        │
│                         │ Send via WS  │───▶│  exec:start  │      │        │
│                         │ exec:start   │    │  received    │      │        │
│                         └──────────────┘    └──────────────┘      │        │
│                                │                    │              │        │
│                                │                    ▼              │        │
│                                │             ┌──────────────┐      │        │
│                                │             │ claude -p    │      │        │
│                                │             │ with prompt  │      │        │
│                                │             └──────────────┘      │        │
│                                │                    │              │        │
│                                │◀───────────────────│              │        │
│                         ┌──────────────┐    exec:stream            │        │
│  ┌──────────┐           │  Sync to     │           │              │        │
│  │  Convex  │◀──────────│   Convex     │           │              │        │
│  │  Updates │           │  (messages)  │           │              │        │
│  └──────────┘           └──────────────┘           │              │        │
│       │                         │                    │              │        │
│       ▼                         │◀───────────────────│              │        │
│  ┌──────────┐           ┌──────────────┐    exec:complete          │        │
│  │ Real-time│           │ Update Phase │           │              │        │
│  │ Subscribe│◀──────────│  Status      │           │              │        │
│  │ (React)  │           │  in Convex   │           │              │        │
│  └──────────┘           └──────────────┘           │              │        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Gateway HTTP Endpoints for Task Execution

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tasks/:taskId/phases/:phase/start` | POST | Start execution of a task phase |
| `/tasks/executions` | GET | List active task executions |
| `/auth/status` | GET | Check if gateway has stored auth token |
| `/auth/setup/start` | POST | Start OAuth flow for Claude authentication |
| `/auth/setup/complete` | POST | Complete OAuth with authorization code |
| `/auth/token` | POST | Manually set auth token |

### Task Orchestrator

The `TaskOrchestrator` class (`packages/agent-gateway/src/task-orchestrator.ts`) handles:

1. **Task/Project Loading**: Fetches task details and project info from Convex
2. **Context Enrichment**: Adds phase-specific context (PR info, issues, planning output)
3. **Prompt Generation**: Uses phase templates to generate appropriate prompts
4. **Container Assignment**: Finds an available container or uses a specified one
5. **Execution Tracking**: Tracks active executions and handles completion
6. **Phase Status Updates**: Updates Convex with phase status changes

### Phase Prompt Templates

The `phase-prompts.ts` module generates prompts for each phase:

| Phase | Permission Mode | Default Model | Budget |
|-------|-----------------|---------------|--------|
| Requirements | plan | sonnet | $0.50 |
| Planning | plan | sonnet | $2.00 |
| Implementation | acceptEdits | sonnet | $10.00 |
| AI Review | plan | sonnet | $3.00 |
| Remediation | acceptEdits | sonnet | $5.00 |
| Human Review | default | sonnet | $5.00 |
| Merge | acceptEdits | sonnet | $1.00 |

### Authentication Flow

Claude authentication uses a one-time setup process:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATION FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ONE-TIME SETUP (via Gateway):                                              │
│  ──────────────────────────────                                             │
│                                                                              │
│  1. Admin calls POST /auth/setup/start                                      │
│  2. Gateway spawns `claude setup-token` via PTY                             │
│  3. Gateway extracts OAuth URL from PTY output                              │
│  4. Gateway returns URL to admin                                            │
│  5. Admin visits URL, authenticates with Claude                             │
│  6. Admin gets authorization code from redirect                             │
│  7. Admin calls POST /auth/setup/complete with code                         │
│  8. Gateway sends code to PTY, extracts token                               │
│  9. Gateway stores token in Convex secrets table                            │
│                                                                              │
│  CONTAINER AUTHENTICATION (automatic):                                       │
│  ─────────────────────────────────────                                       │
│                                                                              │
│  1. Container connects to gateway via WebSocket                             │
│  2. Gateway detects new connection                                          │
│  3. Gateway fetches stored token from Convex                                │
│  4. Gateway sends auth:request message with token                           │
│  5. Container sets ANTHROPIC_AUTH_TOKEN environment                         │
│  6. Container is ready to execute Claude CLI commands                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

This approach means:
- Token is obtained once and stored securely in Convex
- All containers automatically receive the token on connect
- No per-container authentication flow required
- Token can be manually updated via POST /auth/token if needed

## Command Queuing System

The command queuing system ensures that agent prompts are never lost and are executed in priority order when containers become available.

### Queue Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COMMAND QUEUING FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Frontend                  Convex                    Gateway                 │
│  ────────                  ──────                    ───────                 │
│                                                                              │
│  User initiates     ┌──────────────────┐                                    │
│  execution          │ gatewayCommands  │     ConvexCommandProcessor         │
│       │             │     (pending)    │            subscribes              │
│       ▼             └──────────────────┘                 │                  │
│  ┌──────────┐              │                             │                  │
│  │  Call    │──────────────┼─────────────────────────────▶                  │
│  │startExec │              │                             │                  │
│  └──────────┘              │                             ▼                  │
│                            │                   ┌──────────────────┐         │
│                            │                   │ Container avail? │         │
│                            │                   └──────────────────┘         │
│                            │                      │           │             │
│                            │                     YES          NO            │
│                            │                      │           │             │
│                            ▼                      ▼           ▼             │
│                   ┌──────────────────┐    ┌────────────┐ ┌────────────┐     │
│                   │ executionQueue   │    │ Processing │ │  Queued    │     │
│                   │   (tracking)     │    │ (execute)  │ │  (wait)    │     │
│                   └──────────────────┘    └────────────┘ └────────────┘     │
│                            │                      │           │             │
│                            │                      │           │             │
│                            │                      │    ┌──────┴─────┐       │
│                            │                      │    │ Container  │       │
│                            │                      │    │ available  │       │
│                            │                      │    └──────┬─────┘       │
│                            │                      │           │             │
│                            │                      ▼           ▼             │
│                            │              ┌─────────────────────┐           │
│                            │              │    Execute on       │           │
│                            │              │     Container       │           │
│                            │              └─────────────────────┘           │
│                            │                      │                         │
│                            ▼                      ▼                         │
│                   ┌──────────────────┐    ┌────────────────┐                │
│                   │    Completed     │◀───│  Update status │                │
│                   │    (results)     │    │  in Convex     │                │
│                   └──────────────────┘    └────────────────┘                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Command Lifecycle

Commands progress through these states:

| State | Description |
|-------|-------------|
| `pending` | Command created, waiting for gateway to pick up |
| `queued` | Gateway received but no container available, waiting in queue |
| `processing` | Container assigned and executing |
| `completed` | Successfully finished |
| `failed` | Error occurred (may retry) |

### Priority System

Commands have four priority levels that determine execution order:

| Priority | Value | Use Case |
|----------|-------|----------|
| `critical` | 4 | Abort commands, urgent operations |
| `high` | 3 | User-initiated actions, auth token pushes |
| `normal` | 2 | Standard task executions (default) |
| `low` | 1 | Background tasks, batch operations |

Within the same priority level, commands execute in FIFO order (oldest first).

### Retry Configuration

Commands can automatically retry on failure:

```typescript
// Default retry settings
const DEFAULT_MAX_RETRIES = 3      // Container/server commands
const EXECUTION_MAX_RETRIES = 2    // Agent execution commands
```

Retry behavior:
- Transient failures (network, container restart) retry automatically
- Commands return to `pending` state with incremented `retryCount`
- After `maxRetries`, command enters permanent `failed` state
- Non-retryable errors (validation, auth) fail immediately

### Container Pool Management

The `containerPool` table tracks container availability:

```typescript
containerPool: defineTable({
  containerId: v.string(),
  hostname: v.string(),
  status: v.union(
    v.literal("idle"),      // Available for work
    v.literal("busy"),      // Currently executing
    v.literal("reserved"),  // Reserved for specific task
    v.literal("offline")    // Not connected
  ),
  currentSessionId: v.optional(v.string()),
  currentCommandId: v.optional(v.id("gatewayCommands")),
  reservedForTaskId: v.optional(v.string()),
  maxConcurrent: v.number(),    // Capacity (usually 1)
  currentLoad: v.number(),      // Active executions
  lastActivityAt: v.number(),
  lastHealthCheck: v.optional(v.number()),
})
```

Container selection uses LRU (Least Recently Used) strategy - the container with the oldest `lastActivityAt` is selected first.

### Execution Queue Table

For detailed tracking of execution commands:

```typescript
executionQueue: defineTable({
  commandId: v.id("gatewayCommands"),
  taskId: v.optional(v.string()),
  projectId: v.optional(v.string()),
  priority: commandPriorityValidator,
  queuedAt: v.number(),
  estimatedWaitMs: v.optional(v.number()),
  assignedContainerId: v.optional(v.string()),
  assignedAt: v.optional(v.number()),
  status: v.union(
    v.literal("waiting"),    // In queue
    v.literal("assigned"),   // Container assigned
    v.literal("executing"),  // Running
    v.literal("completed"),  // Done
    v.literal("failed"),     // Error
    v.literal("cancelled")   // Aborted
  ),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
})
```

### ConvexCommandProcessor

The gateway's `ConvexCommandProcessor` class manages command execution:

```typescript
class ConvexCommandProcessor {
  // Subscriptions
  - Subscribes to `gatewayCommands.getPending` for new commands
  - Subscribes to `gatewayCommands.getQueued` for queue state

  // Queue processing
  - Checks for available containers every 1 second
  - Assigns highest priority queued command to available container
  - Tracks active executions for abort handling

  // Command types
  - CONTAINER_COMMANDS: startExecution, startPhaseExecution, pushAuthToken
    → Queue if no container available
  - SERVER_COMMANDS: createContainer, stopContainer, deleteContainer
    → Execute immediately (don't require container WebSocket)
}
```

### API Functions

**Frontend Mutations:**
- `gatewayCommands.startExecution` - Start agent execution
- `gatewayCommands.startPhaseExecution` - Start task phase
- `gatewayCommands.abortExecution` - Abort running execution

**Gateway Mutations:**
- `gatewayCommands.markProcessing` - Mark command in progress
- `gatewayCommands.markQueued` - Mark command waiting for container
- `gatewayCommands.assignContainer` - Assign container to command
- `gatewayCommands.complete` - Mark command completed with result
- `gatewayCommands.fail` - Mark command failed (with retry logic)

**Container Pool:**
- `containerPool.register` - Container connects
- `containerPool.unregister` - Container disconnects
- `containerPool.acquire` - Reserve container for execution
- `containerPool.release` - Free container after execution
- `containerPool.getAvailable` - List idle containers (LRU sorted)

## Structured Streaming Storage

Agent messages are stored in structured format for rich display and analysis.

### Message Types

```typescript
agentMessageTypeValidator = v.union(
  v.literal("text"),        // Plain text output
  v.literal("tool_use"),    // Tool invocation
  v.literal("tool_result"), // Tool execution result
  v.literal("thinking"),    // Claude's thinking output
  v.literal("error"),       // Error message
  v.literal("system"),      // System message
  v.literal("result")       // Final execution result
)
```

### Structured Message Schema

```typescript
agentMessages: defineTable({
  sessionId: v.string(),
  messageType: agentMessageTypeValidator,
  streamType: v.optional(v.string()),  // Original stream type

  // Structured content fields
  text: v.optional(v.string()),
  toolName: v.optional(v.string()),
  toolId: v.optional(v.string()),
  toolInput: v.optional(v.any()),
  toolResult: v.optional(v.any()),
  isError: v.optional(v.boolean()),

  // Backward compatibility
  rawContent: v.optional(v.string()),

  // Ordering
  timestamp: v.number(),
  sequenceNumber: v.optional(v.number()),
})
```

### Content Parsing

The `agentMessages.create` mutation automatically parses streaming content:

```
Input (raw stream)                    Output (structured)
──────────────────                    ───────────────────

{ "type": "tool_use",            →    messageType: "tool_use"
  "content_block": {                  toolId: "call_123"
    "id": "call_123",                 toolName: "Read"
    "name": "Read"                    toolInput: undefined (from delta)
  }}

{ "type": "tool_result",         →    messageType: "tool_result"
  "tool_use_id": "call_123",          toolId: "call_123"
  "content": [...],                   toolResult: [...]
  "is_error": false }                 isError: false

Plain text string                →    messageType: "text"
                                      text: "string content"
```

### Batch Processing

For high-throughput streaming, messages can be batched:

```typescript
// ConvexSync batches messages
private BATCH_SIZE = 10
private BATCH_TIMEOUT_MS = 100

// Batch mutation
agentMessages.createBatch({ messages: [
  { sessionId, streamType, content, sequenceNumber },
  ...
]})
```

### Session Summary Query

```typescript
agentMessages.getSessionSummary({ sessionId })
// Returns:
{
  totalMessages: number,
  byType: { text: n, tool_use: n, tool_result: n, ... },
  toolsUsed: string[],
  hasErrors: boolean,
  firstTimestamp: number,
  lastTimestamp: number
}
```

### Tool Call Queries

```typescript
// Get only tool-related messages
agentMessages.getToolCalls({ sessionId })
// Returns tool_use and tool_result messages in order

// Get messages by type
agentMessages.getByType({ sessionId, messageType: "error" })
```

## Container API Architecture

The Container API (`packages/container-api`) runs inside each agent container and manages the Claude Code CLI.

### Components

```
packages/container-api/
├── src/
│   ├── index.ts              # Elysia HTTP server
│   ├── process-manager.ts    # Claude CLI process manager
│   ├── manager-connection.ts # Gateway WebSocket client
│   └── auth-manager.ts       # OAuth flow handling
```

### Process Manager

Wraps the Claude Code CLI with `--print` and `--output-format stream-json`:

```typescript
class ProcessManager {
  // Start a new Claude session
  start(options: StartOptions): AsyncGenerator<CliOutputMessage>

  // List active processes
  list(): ProcessInfo[]

  // Abort a running process
  abort(processId: string): boolean
}
```

The CLI outputs JSON messages that are parsed and forwarded to the gateway:

```typescript
interface CliOutputMessage {
  type: "assistant" | "result" | "system";
  message: AssistantMessage | ResultMessage | SystemMessage;
  session_id?: string;
}
```

### Manager Connection

Maintains WebSocket connection to the gateway with automatic reconnection:

```typescript
class ManagerConnection {
  // Connect to gateway
  connect(): Promise<void>

  // Send message to gateway
  send(type: MessageType, payload: unknown, correlationId?: string): void

  // Handle incoming exec:start messages
  onExecStart(handler: (options: ExecStartPayload) => void): void
}
```

Features:
- Exponential backoff on reconnection
- Heartbeat ping/pong for connection health
- Automatic registration on connect

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
