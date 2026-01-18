# Agent System Design

This document describes the AI agent integration architecture for the Agent Manager platform. The system orchestrates multiple Docker containers running Claude Code CLI, connected via a WebSocket gateway.

## Overview

The Agent Manager uses a distributed architecture:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (React 19)                              │
│                          Real-time subscriptions via Convex                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Convex Backend                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │agentSessions │  │agentMessages │  │  containers  │  │    tasks     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Agent Gateway (Bun WebSocket)                         │
│                    packages/agent-gateway - Port 3100                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │ConnectionMgr │  │  HTTP API    │  │ Convex Sync  │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Container 1   │  │   Container 2   │  │   Container N   │
│  container-api  │  │  container-api  │  │  container-api  │
│  + Claude CLI   │  │  + Claude CLI   │  │  + Claude CLI   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         └────────────────────┴────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Git Repository │
                    │    (cloned)     │
                    └─────────────────┘
```

## Package Structure

### packages/agent-shared

Shared TypeScript types for the WebSocket protocol:

```typescript
// Message types for container <-> gateway communication
export type MessageType =
  | "connect" | "connected" | "heartbeat" | "disconnect"
  | "auth:request" | "auth:status" | "auth:flow:start" | "auth:flow:url" | "auth:flow:complete"
  | "exec:start" | "exec:stream" | "exec:complete" | "exec:abort" | "exec:aborted"
  | "session:list" | "session:data" | "session:delete"
  | "status:process" | "status:health" | "status:resource"
  | "error";

// Base message structure
export interface WebSocketMessage<T = unknown> {
  id: string;
  type: MessageType;
  payload: T;
  timestamp: number;
  correlationId?: string;
}
```

### packages/agent-gateway

Central WebSocket server that containers connect to:

- **ConnectionManager**: Tracks connected containers, health status, heartbeats
- **HTTP API**: REST endpoints for frontend to interact with containers
- **ConvexSync**: Writes events to Convex for persistence and real-time updates

### packages/container-api

Runs inside each Docker container:

- **ProcessManager**: Wraps Claude Code CLI with process lifecycle management
- **ManagerConnection**: WebSocket client that connects to the gateway
- **AuthManager**: Handles OAuth flow for Claude authentication

## WebSocket Protocol

### Message Structure

All messages follow this structure:

```typescript
{
  id: "uuid",              // Unique message ID
  type: "exec:start",      // Message type
  payload: { ... },        // Type-specific data
  timestamp: 1234567890,   // Unix milliseconds
  correlationId?: "uuid"   // For request/response pairing
}
```

### Connection Lifecycle

1. **Container connects** → Sends `connect` message
2. **Gateway registers** → Sends `connected` response
3. **Heartbeat loop** → Container sends periodic `heartbeat`
4. **Health updates** → Container sends `status:health` with metrics
5. **Disconnect** → Connection cleanup on close

### Execution Flow

```
Frontend                    Gateway                     Container
   │                          │                            │
   │  POST /exec              │                            │
   │─────────────────────────▶│                            │
   │                          │  exec:start                │
   │                          │───────────────────────────▶│
   │                          │                            │
   │                          │                     [Claude CLI runs]
   │                          │                            │
   │                          │  exec:stream (stdout)      │
   │                          │◀───────────────────────────│
   │  [Convex subscription]   │                            │
   │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │                            │
   │                          │  exec:stream (assistant)   │
   │                          │◀───────────────────────────│
   │  [Convex subscription]   │                            │
   │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │                            │
   │                          │  exec:complete             │
   │                          │◀───────────────────────────│
   │  [Convex subscription]   │                            │
   │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │                            │
```

### Message Types Reference

#### Connection Messages

| Type | Direction | Payload |
|------|-----------|---------|
| `connect` | Container → Gateway | `{ containerId, hostname, version, capabilities }` |
| `connected` | Gateway → Container | `{ serverId, timestamp }` |
| `heartbeat` | Bidirectional | `{ seq, sentAt }` |
| `disconnect` | Either | `{ reason?, code? }` |

#### Execution Messages

| Type | Direction | Payload |
|------|-----------|---------|
| `exec:start` | Gateway → Container | `{ prompt, sessionId?, cwd?, taskId?, projectId? }` |
| `exec:stream` | Container → Gateway | `{ streamType, data: CliOutputMessage }` |
| `exec:complete` | Container → Gateway | `{ result, sessionId?, totalCostUsd?, numTurns? }` |
| `exec:abort` | Gateway → Container | `{ processId }` |
| `exec:aborted` | Container → Gateway | `{ processId, reason }` |

#### Status Messages

| Type | Direction | Payload |
|------|-----------|---------|
| `status:health` | Container → Gateway | `{ cpuUsage, memoryUsage, activeSessions }` |
| `status:process` | Container → Gateway | `{ processes: ProcessInfo[] }` |

## Container Architecture

### Docker Image (images/agent/)

The container image includes:

- **Debian bookworm-slim** base
- **Tailscale** for mesh networking and SSH access
- **Bun** runtime for container-api
- **Claude Code CLI** (`@anthropic-ai/claude-code`)
- **Git, GitHub CLI** for repository operations
- **Development tools** (Node.js, tmux, starship)

### Entrypoint Flow

```bash
# 1. Start Tailscale daemon
tailscaled &
tailscale up --authkey=$TS_AUTHKEY --hostname=$TS_HOSTNAME

# 2. Clone workspace repository
git clone https://$GH_TOKEN@github.com/$WORKSPACE_REPO /workspace

# 3. Setup dotfiles (optional)
if [ -n "$DOTFILES_REPO" ]; then
  git clone $DOTFILES_REPO ~/.config/dotfiles
  stow -d ~/.config/dotfiles -t ~ .
fi

# 4. Start container-api
cd /opt/container-api && bun run src/index.ts
```

### Container API Endpoints

The Elysia HTTP server inside containers provides:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Container health check |
| `/status` | GET | Current processes and system info |
| `/exec` | POST | Start local execution (direct, not via gateway) |
| `/exec/:id` | DELETE | Abort running execution |
| `/auth/status` | GET | Claude authentication status |
| `/auth/login` | POST | Start OAuth flow |

## Creating Containers

### Using create-agent Script

```bash
# Basic usage
bun run create-agent --repo owner/repo-name

# Full options
bun run create-agent \
  --repo owner/repo-name \      # Required: GitHub repo to clone
  --branch feature-branch \      # Optional: Branch to checkout
  --name my-agent \              # Optional: Custom container name
  --server ws://gateway:3100     # Optional: Gateway WebSocket URL
```

### What the Script Does

1. **Generates unique name** (e.g., `proud-blue-falcon`)
2. **Allocates WireGuard port** for direct Tailscale connections
3. **Creates docker-compose override** with environment variables
4. **Starts container** with `docker compose up`
5. **Outputs JSON** with container details

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TS_AUTHKEY` | Yes | Tailscale authentication key |
| `GH_USERNAME` | Yes | GitHub username for cloning |
| `GH_TOKEN` | Yes | GitHub personal access token |
| `WORKSPACE_REPO` | Yes | Repository to clone (set by script) |
| `WORKSPACE_BRANCH` | No | Branch to checkout (default: main) |
| `MANAGER_WS_URL` | No | Gateway WebSocket URL |
| `DOTFILES_REPO` | No | Dotfiles repository for shell config |

## Convex Integration

### Database Tables

#### agentSessions

Tracks Claude Code CLI sessions:

```typescript
agentSessions: defineTable({
  sessionId: v.string(),           // UUID from gateway
  containerId: v.string(),         // Container running the session
  taskId: v.optional(v.id("tasks")),
  projectId: v.optional(v.id("projects")),
  prompt: v.string(),              // Initial prompt
  status: v.union(
    v.literal("starting"),
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("cancelled")
  ),
  result: v.optional(v.string()),
  error: v.optional(v.string()),
  totalCostUsd: v.optional(v.number()),
  numTurns: v.optional(v.number()),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
})
```

#### agentMessages

Streaming output storage:

```typescript
agentMessages: defineTable({
  sessionId: v.string(),           // References agentSessions.sessionId
  messageType: v.union(
    v.literal("assistant"),
    v.literal("result"),
    v.literal("system")
  ),
  content: v.string(),             // JSON stringified CliOutputMessage
  timestamp: v.number(),
})
```

### Real-time Subscriptions

Frontend subscribes to session updates:

```typescript
// Subscribe to session status
const session = useQuery(api.agentSessions.get, { sessionId });

// Subscribe to streaming messages
const messages = useQuery(api.agentMessages.listBySession, { sessionId });
```

### Gateway → Convex Flow

```typescript
// On exec:start
convexSync.recordExecStart(correlationId, containerId, options, taskId, projectId);

// On exec:stream
convexSync.recordStreamEvent(correlationId, containerId, payload, taskId, projectId);

// On exec:complete
convexSync.recordExecComplete(correlationId, containerId, payload, taskId, projectId);
```

## Claude Code CLI Integration

### Print Mode

The container-api runs Claude Code with `--print` mode for non-interactive streaming:

```bash
claude --print \
  --output-format stream-json \
  --session-id $SESSION_ID \
  "$PROMPT"
```

### Output Format

The CLI outputs JSON messages to stdout:

```typescript
interface CliOutputMessage {
  type: "assistant" | "result" | "system";
  message: AssistantMessage | ResultMessage | SystemMessage;
  session_id?: string;
}

interface AssistantMessage {
  type: "text" | "tool_use" | "tool_result";
  content: string;
  tool_name?: string;
}

interface ResultMessage {
  result: "success" | "error" | "cancelled";
  cost_usd?: number;
  num_turns?: number;
}
```

### Session Management

Sessions persist across executions using `--session-id`:

```typescript
// Resume existing session
await processManager.start({
  prompt: "Continue with the refactoring",
  sessionId: "existing-session-id"
});

// Start new session
await processManager.start({
  prompt: "Implement the feature described in task #123"
});
```

## Security Considerations

### Container Isolation

- Containers run with limited capabilities (`net_admin` for Tailscale only)
- Memory limits prevent runaway processes (4GB hard limit)
- Each container has isolated filesystem and network namespace

### Authentication

- **Tailscale**: Containers authenticate via ephemeral auth keys
- **GitHub**: Personal access tokens for repo access
- **Claude**: OAuth flow handled by container-api

### Network Security

- Containers communicate via Tailscale mesh (encrypted WireGuard)
- Gateway accepts connections only from authenticated Tailscale nodes
- No direct internet exposure of container services

## Monitoring

### Health Checks

Gateway tracks container health:

```typescript
interface StatusHealthPayload {
  cpuUsage: number;      // 0-100 percentage
  memoryUsage: number;   // 0-100 percentage
  activeSessions: number;
  uptime: number;        // seconds
}
```

### Connection Pruning

Stale connections are pruned periodically:

```typescript
// Every 60 seconds, remove containers that haven't heartbeated
setInterval(() => {
  const pruned = connections.pruneStaleConnections();
  for (const containerId of pruned) {
    convexSync.updateContainerConnection(containerId, "", false);
  }
}, 60000);
```

### Logging

All components log to stdout for container aggregation:

```
[gateway] New WebSocket connection
[gateway] Container registered: proud-blue-falcon
[gateway] Execution started: abc123 on proud-blue-falcon
[gateway] Stream from proud-blue-falcon: stdout assistant
[gateway] Execution complete from proud-blue-falcon: success
```

## Future Enhancements

1. **Multi-agent collaboration**: Multiple containers working on related tasks
2. **Container pools**: Pre-warmed containers for faster task assignment
3. **Cost tracking**: Per-session and per-project API cost aggregation
4. **Execution history**: Browse past sessions with full output replay
5. **Container scaling**: Auto-scale containers based on queue depth
