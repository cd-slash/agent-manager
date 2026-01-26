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

**Purpose**: Explore the codebase and design an implementation approach

**Inputs**:
- Task title and description
- Custom prompt/instructions
- Repository and branch context
- Acceptance criteria (if provided)

**Outputs**:
- Files to modify/create
- Implementation steps
- Testing strategy
- Risks/considerations

**Default Prompt Template** (from `phase-prompts.ts`):
```
# Task: {title}

## Description
{description}

## Additional Instructions (if any)
{prompt}

## Acceptance Criteria
{acceptanceCriteria}

## Your Role
You are a software architect. Your job is to:

1. **Explore** the codebase to understand the existing architecture
2. **Identify** the files that need to be modified or created
3. **Design** a step-by-step implementation plan
4. **Consider** edge cases, error handling, and testing
5. **Document** any risks or technical decisions

## Context
- Repository: {repo}
- Branch: {branch}

## Instructions
1. Use the available tools to read and explore the codebase
2. Understand the patterns and conventions used
3. Create a detailed implementation plan

## Output Format
Provide:
1. **Files to Modify**: List each file with what changes are needed
2. **New Files**: List any new files to create
3. **Implementation Steps**: Numbered list of concrete steps
4. **Testing Strategy**: How to verify the implementation
5. **Risks/Considerations**: Any concerns or alternatives

Do NOT write implementation code yet. Focus on planning.
```

**Configuration**: Model: sonnet, Permission: plan, Budget: $2.00

### Implementation Agent

**Purpose**: Write code to implement the planned feature

**Inputs**:
- Task title and description
- Acceptance criteria
- Planning phase output (if available)
- Repository state

**Outputs**:
- Code changes committed to feature branch
- Pull request created
- Summary of what was implemented

**Default Prompt Template** (from `phase-prompts.ts`):
```
# Task: {title}

## Description
{description}

## Additional Instructions (if any)
{prompt}

## Acceptance Criteria
{acceptanceCriteria}

## Implementation Plan (from planning phase)
{planningOutput}

## Your Role
You are a senior software engineer. Your job is to:

1. **Implement** the task according to the requirements and plan
2. **Follow** existing code patterns and conventions
3. **Write** clean, maintainable, well-documented code
4. **Create** or update tests as needed
5. **Commit** your changes with clear commit messages

## Context
- Repository: {repo}
- Branch: {branch}

## Instructions
1. Create a new feature branch from {branch}
2. Implement the required changes
3. Run existing tests to ensure nothing breaks
4. Add new tests if appropriate
5. Commit your changes with descriptive messages
6. Push the branch and create a pull request

## Code Quality Requirements
- Follow the existing code style and patterns
- Add appropriate error handling
- Include comments for complex logic
- Ensure type safety (if TypeScript)
- Do not introduce security vulnerabilities

## Output
After completing the implementation:
1. Summarize what was implemented
2. List all files modified/created
3. Describe any decisions made during implementation
4. Note any concerns or follow-up items
```

**Configuration**: Model: sonnet, Permission: acceptEdits, Budget: $10.00

### AI Review Agent

**Purpose**: Review the PR for quality, security, and correctness

**Inputs**:
- Task description and acceptance criteria
- Pull request details (number, URL, branch)
- Code diff

**Outputs**:
- Summary of changes
- Acceptance criteria status check
- Issues list with severity (critical, major, minor, suggestion)
- Verdict: APPROVE, REQUEST_CHANGES, or NEEDS_DISCUSSION

**Default Prompt Template** (from `phase-prompts.ts`):
```
# Code Review: {title}

## Original Task Description
{description}

## Acceptance Criteria
{acceptanceCriteria}

## Pull Request
- PR #{prNumber}
- URL: {prUrl}
- Branch: {prBranch}

## Your Role
You are a senior code reviewer. Your job is to:

1. **Review** all changes in the pull request
2. **Verify** the implementation meets the acceptance criteria
3. **Check** for bugs, security issues, and code quality problems
4. **Identify** any missing tests or edge cases
5. **Provide** constructive feedback

## Review Checklist
- [ ] Code correctness - Does it work as intended?
- [ ] Code quality - Is it clean, readable, and maintainable?
- [ ] Error handling - Are errors handled appropriately?
- [ ] Security - Are there any security vulnerabilities?
- [ ] Performance - Are there any performance concerns?
- [ ] Testing - Are there adequate tests?
- [ ] Documentation - Is the code well-documented?
- [ ] Style - Does it follow project conventions?

## Context
- Repository: {repo}
- Branch: {branch}

## Instructions
1. Read the diff of all changed files
2. Understand what was implemented
3. Verify against acceptance criteria
4. Look for issues and improvements

## Output Format
Provide:
1. **Summary**: Brief overview of the changes
2. **Acceptance Criteria Status**: Check each criterion
3. **Issues Found**: List any problems (with severity)
4. **Recommendations**: Suggestions for improvement
5. **Verdict**: APPROVE, REQUEST_CHANGES, or NEEDS_DISCUSSION
```

**Configuration**: Model: sonnet, Permission: plan (read-only), Budget: $3.00

### Remediation Agent

**Purpose**: Fix issues identified during AI or Human review

**Inputs**:
- Issues from AI review (with severity, file path, line number)
- Human feedback text (when triggered by human)
- Current PR state

**Outputs**:
- Code fixes committed to feature branch
- Updated PR
- List of how each issue was addressed

**Default Prompt Template** (from `phase-prompts.ts`):
```
# Remediation: {title}

## Original Task Description
{description}

## Pull Request
- PR #{prNumber}
- Branch: {prBranch}

## Issues to Fix
{issues - formatted as:}
### Issue 1: {issueTitle}
- **Severity**: {severity}
- **Description**: {issueDescription}
- **File**: {filePath}:{lineNumber}

## Human Reviewer Feedback (if triggered by human)
{humanFeedback}

## Your Role
You are a software engineer fixing issues found during code review. Your job is to:

1. **Address** each issue identified in the review
2. **Fix** bugs, security issues, and code quality problems
3. **Add** missing tests or error handling
4. **Update** documentation if needed
5. **Commit** your fixes with clear messages

## Context
- Repository: {repo}
- Branch: {branch}

## Instructions
1. Review each issue carefully
2. Make the necessary fixes
3. Ensure fixes don't introduce new problems
4. Run tests to verify the fixes
5. Commit and push your changes

## Output
After completing remediation:
1. List each issue and how it was addressed
2. Describe any additional changes made
3. Note any issues that couldn't be fully resolved
4. Confirm tests are passing
```

**Configuration**: Model: sonnet, Permission: acceptEdits, Budget: $5.00

### Human Review Assistant Agent

**Purpose**: Help human reviewer understand and test the changes

**Inputs**:
- Task description
- PR details and history
- AI review results

**Outputs**:
- Answers to human's questions
- Explanations of code changes
- Testing assistance

**Default Prompt Template** (from `phase-prompts.ts`):
```
# Assisting Human Review: {title}

## Original Task Description
{description}

## Pull Request
- PR #{prNumber}
- URL: {prUrl}
- Branch: {prBranch}

## Your Role
You are an assistant helping a human reviewer test and evaluate the changes.
Your job is to:

1. **Answer** questions about the implementation
2. **Run** specific tests or commands as requested
3. **Demonstrate** functionality as needed
4. **Explain** code changes and decisions
5. **Help** identify any remaining issues

## Context
- Repository: {repo}
- Branch: {branch}

## Instructions
You are now in an interactive session with the human reviewer.
- Respond to their questions and requests
- Run commands they ask you to run
- Help them understand and test the changes
- Be ready to make minor fixes if requested

Await the reviewer's instructions.
```

**Configuration**: Model: sonnet, Permission: default (interactive), Budget: $5.00

### Merge Agent

**Purpose**: Merge the approved PR to main branch

**Inputs**:
- Approved PR details
- Main branch state

**Outputs**:
- Merged PR
- Deleted feature branch
- Merge commit hash

**Default Prompt Template** (from `phase-prompts.ts`):
```
# Merge: {title}

## Task Description
{description}

## Pull Request
- PR #{prNumber}
- Branch: {prBranch}

## Your Role
You are completing the task by merging the approved pull request. Your job is to:

1. **Verify** all checks are passing
2. **Merge** the pull request
3. **Clean up** the feature branch if appropriate
4. **Update** any related documentation or tracking

## Context
- Repository: {repo}
- Target Branch: {branch}

## Instructions
1. Check that all CI checks have passed
2. Verify the PR is approved
3. Merge the pull request (prefer squash merge for cleaner history)
4. Delete the feature branch
5. Confirm the merge was successful

## Output
After completing the merge:
1. Confirm the PR was merged successfully
2. Note the merge commit hash
3. Confirm the feature branch was deleted
4. Any post-merge notes or follow-up items
```

**Configuration**: Model: sonnet, Permission: acceptEdits, Budget: $1.00

## Task Execution via Gateway

When a user initiates a task phase from the frontend, execution flows through the Agent Gateway:

### Frontend → Gateway → Container Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TASK PHASE EXECUTION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Frontend:                                                                  │
│    agentGateway.startPhaseExecution({                                       │
│      taskId: "abc123",                                                      │
│      phase: "implementation"                                                │
│    })                                                                       │
│         │                                                                   │
│         ▼                                                                   │
│  Gateway HTTP API:                                                          │
│    POST /tasks/abc123/phases/implementation/start                           │
│         │                                                                   │
│         ▼                                                                   │
│  TaskOrchestrator:                                                          │
│    1. Fetch task and project from Convex                                    │
│    2. Build TaskContext with all relevant data                              │
│    3. Enrich context (PR info, issues, planning output)                     │
│    4. Generate prompt using phase-prompts.ts                                │
│    5. Find available container                                              │
│    6. Send exec:start via WebSocket                                         │
│         │                                                                   │
│         ▼                                                                   │
│  Container:                                                                 │
│    claude -p --output-format stream-json                                    │
│         │                                                                   │
│         ▼                                                                   │
│  Stream back: exec:stream → Convex → Frontend (real-time)                  │
│  Complete:    exec:complete → Update phase status → Trigger next phase      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Gateway API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tasks/:taskId/phases/:phase/start` | POST | Start phase execution |
| `/tasks/executions` | GET | List active executions |
| `/auth/status` | GET | Check for stored auth token |
| `/auth/setup/start` | POST | Start OAuth flow |
| `/auth/setup/complete` | POST | Complete OAuth with code |
| `/auth/token` | POST | Manually set token |

### Authentication

Authentication is handled once at the gateway level:

1. **One-time setup**: Admin runs OAuth flow via `/auth/setup/start`
2. **Token storage**: Token stored in Convex `secrets` table
3. **Auto-push**: When containers connect, gateway pushes token via `auth:request`
4. **Container ready**: Container sets `ANTHROPIC_AUTH_TOKEN` env var

This means:
- No per-container authentication required
- Token is shared across all containers
- Containers are immediately ready to execute

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
│  container-daemon  │  │  container-daemon  │  │  container-daemon  │
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

### packages/container-daemon

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

### Docker Image

Containers are built dynamically by the gateway using an inline Dockerfile. The image includes:

- **Debian bookworm-slim** base
- **Tailscale** for mesh networking and SSH access
- **Bun** runtime for container-daemon
- **Claude Code CLI** (`@anthropic-ai/claude-code`)
- **Git** for repository operations

### Entrypoint Flow

The entrypoint script (embedded in the container at build time):

1. **Start Tailscale** with ephemeral auth key (auto-removes when offline)
2. **Clone workspace** if `WORKSPACE_REPO` is set
3. **Start container-daemon** binary (SCP'd after container starts)

### Deployed Binaries

Two binaries are deployed to each container after it starts:

| Binary | Location | Purpose |
|--------|----------|---------|
| `container-daemon` | `/opt/container-daemon/container-daemon` | Background service managing Claude CLI |
| `code-agent-tools` | `/usr/local/bin/code-agent-tools` | CLI for agents to interact with Convex |

Both binaries are compiled from the monorepo by the gateway and SCP'd into containers during the "deploying_binary" build phase.

### Container Daemon

The container-daemon is a background service that:

1. **Connects to Convex** and registers in the `containerPool`
2. **Subscribes to commands** via Convex real-time sync (`containerCommands.getForContainer`)
3. **Executes Claude CLI** commands and streams results back to Convex
4. **Manages auth tokens** received from Convex secrets

The only HTTP endpoint is `/health` for startup verification:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Container health check (used by entrypoint script) |

## Creating Containers

### Convex-Driven Flow

Containers are created through the Convex serverCommands system:

1. **Via Frontend**: Create containers from the UI
2. **Via Gateway API**: `POST /containers/create`
3. **Via Convex**: Insert into `serverCommands` with `type: "createContainer"`

### What Happens

1. **Gateway receives command** via Convex subscription
2. **Fetches config from Convex**: Tailscale API key, GitHub credentials
3. **Generates ephemeral Tailscale auth key** via Tailscale API
4. **Builds container** with inline Dockerfile
5. **Deploys container-daemon binary** via SCP
6. **Starts container-daemon** with `CONVEX_URL` for direct Convex integration
7. **Container registers** in `containerPool` and is ready for tasks

### Environment Variables (Set Automatically)

| Variable | Description |
|----------|-------------|
| `TS_AUTHKEY` | Ephemeral Tailscale auth key (generated via API) |
| `TS_HOSTNAME` | Container hostname |
| `TS_WG_PORT` | WireGuard port for direct connections |
| `WORKSPACE_REPO` | Repository to clone (if specified) |
| `WORKSPACE_BRANCH` | Branch to checkout |
| `GH_USERNAME` | GitHub username (from Convex secrets) |
| `GH_TOKEN` | GitHub token (from Convex secrets) |
| `CONVEX_URL` | Convex deployment URL (for container-daemon) |
| `CONTAINER_ID` | Container identifier |

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
| 1 | `building_binary` | Compiling container-daemon and agent-cli binaries (if needed) |
| 2 | `building_image` | Docker build in progress |
| 3 | `starting_container` | Container starting, Tailscale connecting |
| 4 | `deploying_binary` | SCP'ing both binaries to container |
| 5 | `starting_daemon` | Starting container-daemon service |
| 6 | `ready` | Fully operational |

The frontend subscribes to build progress in real-time:

```typescript
// Subscribe to build status
const build = useQuery(api.containerBuilds.getByContainer, { containerId });

// Subscribe to all phases
const phases = useQuery(api.containerBuilds.getPhases, { containerId });
```

## Claude Code CLI Integration

### Sandbox Permissions

Since containers are fully sandboxed environments, Claude Code runs with `--dangerously-skip-permissions` to allow full tool access. This means:

- **All Bash commands** are allowed (no tool restrictions)
- **All file operations** (read, write, edit) work without prompts
- **Web access** for documentation and API calls
- **Full git operations** for commits, branches, PRs

The permission mode in phase configurations is now advisory only - used in prompts to guide agent behavior (e.g., "focus on planning, don't write code yet") but doesn't restrict actual capabilities.

### Agent CLI Tools (`code-agent-tools`)

Agents have access to a CLI tool for interacting with the Convex database. This allows agents to:

- Update acceptance criteria status
- Add notes about findings and decisions
- Query task and project information
- Check phase status and dependencies

The CLI binary is deployed to `/usr/local/bin/code-agent-tools` and is available in PATH.

#### Available Commands

```bash
# Task Management
code-agent-tools task get <task-id>
code-agent-tools task list --project-id <id>
code-agent-tools task create --project-id <id> --title "..." --description "..."
code-agent-tools task update <task-id> --title "..." --description "..."
code-agent-tools task move <task-id> --category <backlog|todo|in-progress|done>

# Acceptance Criteria (Requirements)
code-agent-tools requirements list --task-id <id>
code-agent-tools requirements add --task-id <id> --text "User can login with email"
code-agent-tools requirements add-bulk --task-id <id> --items '["Req 1", "Req 2"]'
code-agent-tools requirements set-done <criteria-id> --done true
code-agent-tools requirements delete <criteria-id>

# Notes/Chat Messages
code-agent-tools notes add --task-id <id> --text "Found auth module needs refactoring"
code-agent-tools notes add --project-id <id> --text "Architecture decision: using JWT"
code-agent-tools notes list --task-id <id>

# Project Information
code-agent-tools project get <project-id>
code-agent-tools project list
code-agent-tools project stats <project-id>

# Task Dependencies
code-agent-tools deps list --task-id <id>
code-agent-tools deps add --task-id <id> --depends-on <other-task-id>
code-agent-tools deps blocked-by --task-id <id>

# Phase Information (read-only)
code-agent-tools phase current --task-id <id>
code-agent-tools phase list --task-id <id>
```

All commands output JSON:

```json
{
  "success": true,
  "data": {
    "task": { "id": "...", "title": "...", ... },
    "requirements": [ ... ]
  }
}
```

#### Environment

The CLI uses the `CONVEX_URL` environment variable (automatically set in containers) to connect to the database. No additional authentication is required.

### TODO: Phase-Specific CLI Permissions

> **Future Enhancement**: The current CLI provides full access to all commands regardless of phase context. This should be refined to restrict access based on:
>
> 1. **Current Phase**: An agent in the implementation phase shouldn't need to create/delete tasks on the project
> 2. **Task vs Project Context**: When working on a specific task, project-level mutations should be limited
> 3. **Read vs Write**: Some phases (like AI Review) should have read-only access to most resources
>
> Proposed restrictions by phase:
>
> | Phase | Allowed CLI Operations |
> |-------|----------------------|
> | Requirements | Full requirements CRUD, notes add, task read |
> | Planning | Requirements read, notes add, deps read, task read |
> | Implementation | Requirements set-done, notes add, task read |
> | AI Review | All read operations only |
> | Remediation | Requirements set-done, notes add, task read |
> | Human Review | All operations (interactive with human) |
> | Merge | Task read, notes add |
>
> Implementation options:
> - Pass `--phase` and `--task-id` flags to CLI, validate server-side
> - Generate phase-specific CLI binaries or config
> - Use environment variables to set allowed operations
>
> This prevents agents from accidentally or unnecessarily modifying project state outside their scope.

### Print Mode

The container-daemon runs Claude Code with `--print` mode for non-interactive streaming:

```bash
claude --print \
  --output-format stream-json \
  --dangerously-skip-permissions \
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
- **Claude**: OAuth flow handled by container-daemon

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
8. **Phase-specific CLI permissions**: Restrict agent CLI access based on current phase and context (see TODO in Agent CLI Tools section)
