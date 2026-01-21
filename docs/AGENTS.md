# Agent System Design

This document describes the AI agent integration architecture for the Agent Manager platform. The system orchestrates multiple Docker containers running Claude Code CLI, connected via a WebSocket gateway.

## Task Phase Agents

Each phase in the task lifecycle uses a specialized agent with its own configuration:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT ROLES BY PHASE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Phase              Agent Role            Default Model    Permission Mode  │
│  ─────              ──────────            ─────────────    ───────────────  │
│  Requirements       (none - manual)       -                -                │
│  Planning           Planning Agent        Sonnet           plan             │
│  Implementation     Implementation Agent  Sonnet           accept_edits     │
│  AI Review          Review Agent          Sonnet           default          │
│  Remediation        Remediation Agent     Sonnet           accept_edits     │
│  Human Review       Assistant Agent       Sonnet           default          │
│  Merge              Merge Agent           Sonnet           accept_edits     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Planning Agent

**Purpose**: Analyze task requirements and prepare for implementation

**Inputs**:
- Task title and description
- Project context

**Outputs**:
- Acceptance criteria (checklist items)
- Implementation prompt (detailed instructions for Implementation Agent)
- Test cases (expected behaviors to verify)

**Default Prompt Template**:
```
You are a planning agent. Analyze this task and prepare it for implementation.

Task: {{task.title}}
Description: {{task.description}}

Your job is to:
1. Create detailed acceptance criteria that define when this task is complete
2. Write the implementation prompt that will be given to the implementation agent
3. Define test cases that should pass when the implementation is complete

Output structured JSON with:
- acceptanceCriteria: array of criteria strings
- implementationPrompt: the full prompt for the implementation agent
- testCases: array of test definitions
```

### Implementation Agent

**Purpose**: Write code to implement the planned feature

**Inputs**:
- Implementation prompt from Planning phase
- Acceptance criteria
- Repository state

**Outputs**:
- Code changes committed to feature branch
- Pull request created

**Default Prompt Template**:
```
You are an implementation agent. Complete this coding task.

Task: {{task.title}}
{{task.implementationPrompt}}

Acceptance Criteria:
{{#each task.acceptanceCriteria}}
- {{this}}
{{/each}}

Requirements:
1. Write clean, well-tested code following project conventions
2. Create a feature branch: task-{{task.id}}
3. Make atomic commits with clear messages
4. Run tests to verify acceptance criteria are met
5. Create a pull request when complete
```

### AI Review Agent

**Purpose**: Review the PR for quality, security, and correctness

**Inputs**:
- Pull request details
- Code diff
- Acceptance criteria

**Outputs**:
- Review comments on PR
- Approval or request for changes
- Issues list with severity

**Default Prompt Template**:
```
You are a code review agent. Review this pull request thoroughly.

Task: {{task.title}}
Pull Request: #{{pr.number}}
Branch: {{pr.branch}} → {{pr.baseBranch}}

Review the code for:
1. Correctness - does it meet the acceptance criteria?
2. Code quality - is it clean, readable, maintainable?
3. Security - any vulnerabilities or unsafe patterns?
4. Performance - any obvious performance issues?
5. Test coverage - are the tests adequate?

Approve or request changes based on your findings.
```

### Remediation Agent

**Purpose**: Fix issues identified during AI or Human review

**Inputs**:
- Issues from AI review (when triggered by AI)
- Human feedback text (when triggered by Human)
- Current PR state

**Outputs**:
- Code fixes committed to feature branch
- Updated PR

**Default Prompt Template**:
```
You are a remediation agent. Fix the issues identified during code review.

Task: {{task.title}}
Remediation Cycle: {{remediation.cycleNumber}} of {{remediation.maxCycles}}
Triggered By: {{remediation.triggeredBy}}

{{#if remediation.feedback}}
Human Feedback:
{{remediation.feedback}}
{{/if}}

{{#if remediation.aiReviewIssues}}
AI Review Issues:
{{#each remediation.aiReviewIssues}}
- {{this.file}}:{{this.line}} - {{this.issue}}
{{/each}}
{{/if}}

Your job is to:
1. Address each issue identified in the review
2. Make the necessary code changes
3. Ensure tests still pass after your changes
4. Commit your fixes with clear messages
```

### Human Review Assistant Agent

**Purpose**: Help human reviewer understand and test the changes

**Inputs**:
- PR details and history
- AI review results
- Preview deployment URL (when available)

**Outputs**:
- Answers to human's questions
- Explanations of code changes
- Testing suggestions

**Default Prompt Template**:
```
You are a review assistant helping a human reviewer evaluate this PR.

Task: {{task.title}}
Pull Request: #{{pr.number}}
Preview URL: {{deployment.previewUrl}}

Help the human reviewer by:
1. Explaining what the code does
2. Highlighting any concerns from the AI review
3. Suggesting things to test in the preview deployment
4. Answering technical questions about the implementation

Be helpful and concise. The human makes the final approval decision.
```

### Merge Agent

**Purpose**: Merge the approved PR to main branch

**Inputs**:
- Approved PR
- Main branch state

**Outputs**:
- Merged PR
- Deleted feature branch

**Default Prompt Template**:
```
You are a merge agent. Merge this approved pull request.

Task: {{task.title}}
Pull Request: #{{pr.number}}

Steps:
1. Verify all required reviews are approved
2. Verify all CI checks are passing
3. Check for merge conflicts with main
4. If conflicts exist, resolve them preserving the intent of both changes
5. Perform squash merge with a clear commit message
6. Verify the merge was successful
7. Delete the feature branch
```

## Remediation Cycle Flow

The remediation system handles iterative fixes when reviews find issues:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REMEDIATION CYCLE FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Trigger Sources:                                                           │
│  ────────────────                                                           │
│                                                                              │
│  ┌───────────┐                           ┌──────────────┐                   │
│  │ AI Review │──── issues found ────────▶│              │                   │
│  │           │     (automatic)           │              │                   │
│  └───────────┘                           │              │                   │
│                                          │ Remediation  │                   │
│  ┌──────────────┐                        │    Agent     │                   │
│  │ Human Review │── request changes ────▶│              │                   │
│  │              │   (with feedback)      │              │                   │
│  └──────────────┘                        └──────────────┘                   │
│                                                  │                          │
│                                                  │ fixes complete           │
│                                                  ▼                          │
│                                          ┌───────────┐                      │
│                                          │ AI Review │◀──┐                  │
│                                          │(validation)│   │                 │
│                                          └───────────┘   │                  │
│                                                │         │                  │
│                               ┌────────────────┴─────────┴────────┐        │
│                               │                                    │        │
│                               ▼                                    ▼        │
│                        ┌────────────┐                      ┌─────────────┐  │
│                        │  Approved  │                      │More Issues  │  │
│                        │     ↓      │                      │     ↓       │  │
│                        │Human Review│                      │ Remediation │  │
│                        └────────────┘                      │   (cycle+1) │  │
│                                                            └─────────────┘  │
│                                                                              │
│  Cycle Limits:                                                              │
│  ─────────────                                                              │
│  • Default max cycles: 3                                                    │
│  • Configurable per-task or globally                                        │
│  • When limit reached: escalate to Human Review                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Remediation Cycle Record

Each remediation cycle is tracked with:

| Field | Description |
|-------|-------------|
| `cycleNumber` | Sequential number (1, 2, 3...) |
| `triggeredBy` | "ai_review" or "human_review" |
| `feedback` | Human's feedback text (when triggered by human) |
| `status` | pending → in_progress → completed/failed |
| `startedAt` / `completedAt` | Timestamps |
| `model` | AI model used |
| `totalCostUsd` | API cost for this cycle |
| `numTurns` | Number of agent turns |
| `result` | Agent's final output |
| `error` | Error message if failed |

### Container Isolation

Each remediation cycle runs in a fresh container:

```
Cycle 1:
  Container: eager-red-fox
  └── Fixes AI review issues
  └── Container destroyed after completion

Cycle 2 (if needed):
  Container: calm-blue-hawk
  └── Fixes remaining issues
  └── Container destroyed after completion

Cycle 3 (if needed):
  Container: swift-green-owl
  └── Final attempt at fixes
  └── If issues remain, escalate to human
```

This isolation prevents:
- State contamination between cycles
- Accumulated context confusion
- Resource leaks from long-running agents

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

#### containerBuilds

Tracks container build sessions with phase-by-phase progress:

```typescript
containerBuilds: defineTable({
  containerId: v.string(),
  repo: v.string(),
  branch: v.string(),
  server: v.string(),
  currentPhase: v.string(),       // Current phase name
  status: v.union(
    v.literal("pending"),
    v.literal("in_progress"),
    v.literal("completed"),
    v.literal("failed")
  ),
  error: v.optional(v.string()),
  taskId: v.optional(v.id("tasks")),
  projectId: v.optional(v.id("projects")),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
})
```

#### containerBuildPhases

Individual phase tracking with logs for debugging:

```typescript
containerBuildPhases: defineTable({
  containerId: v.string(),
  phase: v.string(),              // Phase name
  status: v.union(
    v.literal("pending"),
    v.literal("in_progress"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("skipped")
  ),
  logs: v.optional(v.string()),   // Build output logs
  error: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  order: v.number(),              // Phase order (0-6)
})
```

### Build Phases

Container creation progresses through these phases:

| Order | Phase | Description |
|-------|-------|-------------|
| 0 | `pending` | Request received, waiting to start |
| 1 | `building_binary` | Compiling container-api binary (if needed) |
| 2 | `building_image` | Docker build in progress |
| 3 | `starting_container` | Container starting, Tailscale connecting |
| 4 | `deploying_binary` | SCP'ing binary to container |
| 5 | `starting_api` | Starting container-api service |
| 6 | `ready` | Fully operational |

The frontend subscribes to build progress in real-time:

```typescript
// Subscribe to build status
const build = useQuery(api.containerBuilds.getByContainer, { containerId });

// Subscribe to all phases
const phases = useQuery(api.containerBuilds.getPhases, { containerId });
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

1. **Multi-agent collaboration**: Multiple containers working on related tasks in parallel
2. **Container pools**: Pre-warmed containers for faster task assignment
3. **Cost aggregation dashboards**: Project-level and team-level cost reporting
4. **Execution replay**: Browse past sessions with full output replay and diff viewing
5. **Container scaling**: Auto-scale containers based on queue depth
6. **Custom review criteria**: Define project-specific review checklists for AI Review
7. **Remediation learning**: Track common issues to improve initial implementation prompts
