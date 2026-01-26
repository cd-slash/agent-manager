# Role-Based Access Control (RBAC) Implementation Plan

## Executive Summary

This document outlines a comprehensive role-based permission system for the agent tools CLI. The goal is to replace the current blanket authorization with least-privileged access, where agents receive only the permissions they need for their current context (phase, task type, user overrides).

---

## Current State Analysis

### What Exists Today

1. **Token-based Authentication**: OAuth via `CLAUDE_CODE_OAUTH_TOKEN`
2. **Coarse Permission Modes**: `default|plan|accept_edits|full_auto` (for Claude CLI, not our tools)
3. **Tool Allow/Deny Lists**: Arrays of tools passed to execution command
4. **Container Isolation**: Each container gets task context via environment variables

### Current Problems

- **No granular access control**: Any agent can read/write any task in any project
- **No phase-aware restrictions**: Planning phase agent could move tasks to done
- **No data isolation**: Agents can access tasks from other projects
- **No audit trail**: No logging of who did what when
- **No user override mechanism**: Can't grant extra permissions when needed

---

## Proposed Architecture

### Core Concepts

```
┌─────────────────────────────────────────────────────────────────┐
│                        PERMISSION MODEL                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐     ┌─────────┐     ┌─────────────┐              │
│   │  ROLE   │────▶│ SCOPES  │────▶│ PERMISSIONS │              │
│   └─────────┘     └─────────┘     └─────────────┘              │
│                                                                  │
│   Role = Named set of permissions                               │
│   Scope = Resource boundaries (project, task, phase)            │
│   Permission = Specific action (read, write, move, delete)      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Permission Structure

```typescript
interface Permission {
  resource: ResourceType;    // what resource type
  action: ActionType;        // what action
  scope?: ScopeConstraint;   // optional constraints
}

type ResourceType =
  | 'task'
  | 'task:requirements'
  | 'task:notes'
  | 'task:dependencies'
  | 'task:phase'
  | 'project'
  | 'project:notes'
  | 'project:plan';

type ActionType =
  | 'read'           // View resource
  | 'create'         // Create new resource
  | 'update'         // Modify existing resource
  | 'delete'         // Remove resource
  | 'move'           // Change category/status
  | 'transition';    // Change phase (special)

interface ScopeConstraint {
  ownTaskOnly?: boolean;      // Only the assigned task
  ownProjectOnly?: boolean;   // Only tasks in same project
  currentPhaseOnly?: boolean; // Only modify current phase data
}
```

---

## Defined Roles

### 1. `requirements_gatherer`
**Purpose**: Collect and refine requirements during the requirements phase.

| Resource | Actions | Constraints |
|----------|---------|-------------|
| task | read | own task only |
| task:requirements | read, create, update, delete | own task only |
| task:notes | read, create | own task only |
| project | read | own project only |
| project:notes | read | own project only |
| task:phase | read | own task only |

**Cannot**: Move tasks, modify other tasks, update project plan, create tasks.

---

### 2. `planner`
**Purpose**: Create implementation plans during the planning phase.

| Resource | Actions | Constraints |
|----------|---------|-------------|
| task | read, update | own task only, can update prompt/description |
| task:requirements | read | own task only |
| task:notes | read, create | own task only |
| task:dependencies | read, create, delete | own task only |
| project | read | own project only |
| project:notes | read, create | own project only |
| project:plan | read, update | own project only |
| task:phase | read | own task only |

**Special**: Can update task's `implementationPrompt` field.

---

### 3. `implementer`
**Purpose**: Execute implementation during the implementation phase.

| Resource | Actions | Constraints |
|----------|---------|-------------|
| task | read | own task only |
| task:requirements | read, update | own task only, only done status |
| task:notes | read, create | own task only |
| task:dependencies | read | own task only |
| project | read | own project only |
| task:phase | read | own task only |

**Special**: Can mark requirements as done/not done. Cannot create/delete requirements.

---

### 4. `reviewer`
**Purpose**: Perform AI review during the ai_review phase.

| Resource | Actions | Constraints |
|----------|---------|-------------|
| task | read | own task only |
| task:requirements | read | own task only |
| task:notes | read, create | own task only |
| project | read | own project only |
| task:phase | read | own task only |

**Cannot**: Modify requirements, move tasks. Pure analysis role.

---

### 5. `remediator`
**Purpose**: Fix issues during the remediation phase.

| Resource | Actions | Constraints |
|----------|---------|-------------|
| task | read | own task only |
| task:requirements | read, update | own task only, only done status |
| task:notes | read, create | own task only |
| project | read | own project only |
| task:phase | read | own task only |

**Same as implementer** but during remediation phase.

---

### 6. `project_analyst`
**Purpose**: Read-only analysis across project for statistics/reporting.

| Resource | Actions | Constraints |
|----------|---------|-------------|
| task | read | own project only (all tasks) |
| task:requirements | read | own project only |
| task:notes | read | own project only |
| task:dependencies | read | own project only |
| project | read | own project only |
| project:notes | read | own project only |
| project:plan | read | own project only |
| task:phase | read | own project only |

**Cannot**: Modify anything. Pure read role for cross-task analysis.

---

### 7. `task_manager`
**Purpose**: Create and organize tasks, manage backlog (for autonomous planning agents).

| Resource | Actions | Constraints |
|----------|---------|-------------|
| task | read, create, update, move | own project only |
| task:requirements | read, create, update, delete | own project only |
| task:notes | read, create | own project only |
| task:dependencies | read, create, delete | own project only |
| project | read, update | own project only |
| project:notes | read, create | own project only |
| project:plan | read, update | own project only |
| task:phase | read | own project only |

**High privilege role** for agents that manage the backlog/project structure.

---

### 8. `admin`
**Purpose**: Full access for debugging/emergency situations. User-granted only.

| Resource | Actions | Constraints |
|----------|---------|-------------|
| * | * | none |

**Full access** to all resources and actions. Should require explicit user approval.

---

## Phase-to-Role Mapping

The system automatically assigns roles based on the current task phase:

| Phase | Assigned Role | Rationale |
|-------|---------------|-----------|
| `requirements` | `requirements_gatherer` | Focus on requirements, not implementation |
| `planning` | `planner` | Can create plan but not execute |
| `implementation` | `implementer` | Execute plan, mark requirements done |
| `ai_review` | `reviewer` | Read-only analysis |
| `remediation` | `remediator` | Fix issues, similar to implementer |
| `human_review` | `reviewer` | Read-only while human reviews |
| `merge` | `reviewer` | Read-only during merge |

### Composite Roles

Agents can have multiple roles combined:

```typescript
// Example: Planning agent that needs project-wide visibility
roles: ['planner', 'project_analyst']

// Example: Full-cycle autonomous agent
roles: ['task_manager', 'implementer', 'reviewer']
```

---

## User Overrides

### Override Mechanism

Users can grant additional permissions beyond the default phase-based role:

```typescript
interface RoleOverride {
  taskId: Id<"tasks">;
  sessionId: Id<"agentSessions">;
  additionalRoles: Role[];
  grantedBy: string;  // user identifier
  grantedAt: number;  // timestamp
  expiresAt?: number; // optional expiration
  reason: string;     // audit trail
}
```

### Override UI Flow

1. Agent hits permission denied
2. Agent logs message requesting additional access
3. User sees permission request in chat UI
4. User can approve/deny with optional time limit
5. If approved, override stored and agent retried

### Override Approval Levels

| Override Type | Approval Required |
|--------------|-------------------|
| Add `project_analyst` | Single click |
| Add `task_manager` | Confirmation dialog |
| Add `admin` | Explicit acknowledgment + reason |

---

## Implementation Plan

### Phase 1: Permission Infrastructure

**Files to create/modify:**

#### 1.1 Permission Definitions
```
packages/agent-cli/src/permissions/
├── types.ts           # Permission, Role, Scope types
├── roles.ts           # Role definitions with permissions
├── phase-mapping.ts   # Phase → Role mapping
└── index.ts           # Exports
```

#### 1.2 Permission Checker
```typescript
// packages/agent-cli/src/permissions/checker.ts
export class PermissionChecker {
  constructor(
    private context: AgentContext,  // taskId, projectId, phase, roles
  ) {}

  check(resource: ResourceType, action: ActionType, targetId?: string): boolean {
    // 1. Get permissions from all assigned roles
    // 2. Check if any permission grants the action
    // 3. Verify scope constraints (own task, own project, etc.)
    // 4. Return true/false
  }

  require(resource: ResourceType, action: ActionType, targetId?: string): void {
    if (!this.check(resource, action, targetId)) {
      throw new PermissionDeniedError(resource, action, this.context);
    }
  }
}
```

#### 1.3 Agent Context
```typescript
// packages/agent-cli/src/context.ts
export interface AgentContext {
  taskId: string;
  projectId: string;
  currentPhase: Phase;
  roles: Role[];
  sessionId: string;
  overrides: RoleOverride[];
}

export function loadContextFromEnv(): AgentContext {
  // Read from environment variables injected by container
  return {
    taskId: process.env.TASK_ID!,
    projectId: process.env.PROJECT_ID!,
    currentPhase: process.env.CURRENT_PHASE as Phase,
    roles: JSON.parse(process.env.AGENT_ROLES || '[]'),
    sessionId: process.env.SESSION_ID!,
    overrides: JSON.parse(process.env.ROLE_OVERRIDES || '[]'),
  };
}
```

---

### Phase 2: Command Integration

**Modify each command to check permissions:**

#### 2.1 Task Commands (`packages/agent-cli/src/commands/task.ts`)

```typescript
// Before (current)
.action(async (taskId) => {
  const task = await client.query(api.tasks.getById, { id: taskId });
  console.log(JSON.stringify(task));
});

// After (with permissions)
.action(async (taskId) => {
  const ctx = loadContextFromEnv();
  const checker = new PermissionChecker(ctx);

  // Verify we can read this task
  checker.require('task', 'read', taskId);

  const task = await client.query(api.tasks.getById, { id: taskId });

  // Additional scope check
  if (ctx.roles.some(r => hasConstraint(r, 'ownTaskOnly')) && taskId !== ctx.taskId) {
    throw new PermissionDeniedError('task', 'read', ctx, 'Can only access assigned task');
  }

  console.log(JSON.stringify(task));
});
```

#### 2.2 Permission Checks by Command

| Command | Resource | Action | Scope Check |
|---------|----------|--------|-------------|
| `task get` | task | read | ownTaskOnly / ownProjectOnly |
| `task list` | task | read | ownProjectOnly |
| `task create` | task | create | ownProjectOnly |
| `task update` | task | update | ownTaskOnly |
| `task move` | task | move | ownTaskOnly |
| `requirements list` | task:requirements | read | ownTaskOnly |
| `requirements add` | task:requirements | create | ownTaskOnly |
| `requirements update` | task:requirements | update | ownTaskOnly |
| `requirements delete` | task:requirements | delete | ownTaskOnly |
| `requirements set-done` | task:requirements | update | ownTaskOnly |
| `notes add` | task:notes / project:notes | create | ownTaskOnly / ownProjectOnly |
| `notes list` | task:notes / project:notes | read | ownTaskOnly / ownProjectOnly |
| `project get` | project | read | ownProjectOnly |
| `project list` | project | read | all (limited info) |
| `project update-plan` | project:plan | update | ownProjectOnly |
| `project stats` | project | read | ownProjectOnly |
| `deps list` | task:dependencies | read | ownTaskOnly / ownProjectOnly |
| `deps add` | task:dependencies | create | ownTaskOnly |
| `deps remove` | task:dependencies | delete | ownTaskOnly |
| `deps blocked-by` | task:dependencies | read | ownTaskOnly |
| `phase current` | task:phase | read | ownTaskOnly |
| `phase list` | task:phase | read | ownTaskOnly |

---

### Phase 3: Container Integration

**Inject role information into container environment:**

#### 3.1 Modify Execution Command Payload

```typescript
// packages/agent-shared/src/index.ts
interface StartExecutionPayload {
  // ... existing fields ...

  // New RBAC fields
  agentRoles: Role[];
  roleOverrides?: RoleOverride[];
  currentPhase: Phase;
}
```

#### 3.2 Modify Gateway Phase Execution

```typescript
// packages/agent-gateway/src/phase-prompts.ts
export async function startPhaseExecution(
  containerId: string,
  taskId: string,
  phase: Phase,
  // ...
) {
  // Determine roles from phase
  const roles = getDefaultRolesForPhase(phase);

  // Check for user overrides
  const overrides = await getActiveOverrides(taskId);

  // Combine into effective roles
  const effectiveRoles = combineRoles(roles, overrides);

  // Send to container with role info
  await sendExecutionCommand(containerId, {
    // ...existing...
    agentRoles: effectiveRoles,
    roleOverrides: overrides,
    currentPhase: phase,
  });
}
```

#### 3.3 Modify Container Daemon

```typescript
// packages/container-daemon/src/execution.ts
function buildEnvironment(command: StartExecutionPayload): Record<string, string> {
  return {
    // ...existing...
    AGENT_ROLES: JSON.stringify(command.agentRoles),
    ROLE_OVERRIDES: JSON.stringify(command.roleOverrides || []),
    CURRENT_PHASE: command.currentPhase,
  };
}
```

---

### Phase 4: Database Schema

**Add tables for role management:**

#### 4.1 Schema Updates (`convex/schema.ts`)

```typescript
// Role overrides table
roleOverrides: defineTable({
  taskId: v.id("tasks"),
  sessionId: v.id("agentSessions"),
  additionalRoles: v.array(v.string()),
  grantedBy: v.string(),
  grantedAt: v.number(),
  expiresAt: v.optional(v.number()),
  reason: v.string(),
  status: v.union(v.literal("active"), v.literal("expired"), v.literal("revoked")),
})
  .index("by_task", ["taskId"])
  .index("by_session", ["sessionId"])
  .index("by_task_active", ["taskId", "status"]),

// Audit log for permission checks
permissionAuditLog: defineTable({
  timestamp: v.number(),
  sessionId: v.id("agentSessions"),
  taskId: v.id("tasks"),
  resource: v.string(),
  action: v.string(),
  targetId: v.optional(v.string()),
  allowed: v.boolean(),
  roles: v.array(v.string()),
  reason: v.optional(v.string()),
})
  .index("by_session", ["sessionId"])
  .index("by_task", ["taskId"])
  .index("by_timestamp", ["timestamp"]),
```

#### 4.2 Permission Audit Functions (`convex/permissionAudit.ts`)

```typescript
// Log permission check results (for debugging/audit)
export const logPermissionCheck = mutation({
  args: {
    sessionId: v.id("agentSessions"),
    taskId: v.id("tasks"),
    resource: v.string(),
    action: v.string(),
    targetId: v.optional(v.string()),
    allowed: v.boolean(),
    roles: v.array(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("permissionAuditLog", {
      ...args,
      timestamp: Date.now(),
    });
  },
});
```

---

### Phase 5: Override Request Flow

**Enable agents to request additional permissions:**

#### 5.1 CLI Command for Permission Request

```typescript
// packages/agent-cli/src/commands/permissions.ts
program
  .command('request')
  .description('Request additional role/permission')
  .requiredOption('--role <role>', 'Role to request')
  .requiredOption('--reason <reason>', 'Why this permission is needed')
  .action(async (options) => {
    const ctx = loadContextFromEnv();

    await client.mutation(api.roleOverrides.requestOverride, {
      taskId: ctx.taskId,
      sessionId: ctx.sessionId,
      requestedRole: options.role,
      reason: options.reason,
    });

    console.log(JSON.stringify({
      status: 'pending',
      message: 'Permission request submitted. Waiting for user approval.',
    }));
  });
```

#### 5.2 Frontend Permission Request UI

Add to chat view:

```tsx
// packages/frontend/src/components/PermissionRequestCard.tsx
export function PermissionRequestCard({ request }: Props) {
  return (
    <div className="bg-warning/10 border border-warning rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="text-warning" size={16} />
        <span className="font-semibold">Permission Request</span>
      </div>
      <p className="text-sm mb-2">
        Agent is requesting: <code>{request.requestedRole}</code>
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        Reason: {request.reason}
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => approve(request.id)}>
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => deny(request.id)}>
          Deny
        </Button>
      </div>
    </div>
  );
}
```

---

### Phase 6: Error Handling & Messaging

**Provide clear feedback when permissions are denied:**

#### 6.1 Permission Error Format

```typescript
// packages/agent-cli/src/permissions/errors.ts
export class PermissionDeniedError extends Error {
  constructor(
    public resource: ResourceType,
    public action: ActionType,
    public context: AgentContext,
    public additionalInfo?: string,
  ) {
    super(
      `Permission denied: Cannot ${action} ${resource}. ` +
      `Current roles: [${context.roles.join(', ')}]. ` +
      `Current phase: ${context.currentPhase}. ` +
      (additionalInfo || '')
    );
    this.name = 'PermissionDeniedError';
  }

  toJSON() {
    return {
      error: 'PERMISSION_DENIED',
      resource: this.resource,
      action: this.action,
      currentRoles: this.context.roles,
      currentPhase: this.context.currentPhase,
      message: this.message,
      hint: this.getHint(),
    };
  }

  getHint(): string {
    // Provide actionable hints based on what was denied
    if (this.resource === 'task' && this.action === 'create') {
      return 'Task creation requires task_manager role. Request this role if needed.';
    }
    // ... more hints
  }
}
```

#### 6.2 CLI Error Output

```json
{
  "error": "PERMISSION_DENIED",
  "resource": "task",
  "action": "create",
  "currentRoles": ["implementer"],
  "currentPhase": "implementation",
  "message": "Permission denied: Cannot create task. Current roles: [implementer]. Current phase: implementation.",
  "hint": "Task creation requires task_manager role. Request this role if needed."
}
```

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `packages/agent-cli/src/permissions/types.ts` | Type definitions |
| `packages/agent-cli/src/permissions/roles.ts` | Role definitions |
| `packages/agent-cli/src/permissions/checker.ts` | Permission checking logic |
| `packages/agent-cli/src/permissions/phase-mapping.ts` | Phase → Role mapping |
| `packages/agent-cli/src/permissions/errors.ts` | Permission errors |
| `packages/agent-cli/src/context.ts` | Agent context loading |
| `packages/agent-cli/src/commands/permissions.ts` | Permission CLI commands |
| `convex/roleOverrides.ts` | Override management |
| `convex/permissionAudit.ts` | Audit logging |
| `packages/frontend/src/components/PermissionRequestCard.tsx` | Override request UI |

### Modified Files

| File | Changes |
|------|---------|
| `convex/schema.ts` | Add roleOverrides, permissionAuditLog tables |
| `packages/agent-cli/src/commands/task.ts` | Add permission checks |
| `packages/agent-cli/src/commands/requirements.ts` | Add permission checks |
| `packages/agent-cli/src/commands/notes.ts` | Add permission checks |
| `packages/agent-cli/src/commands/project.ts` | Add permission checks |
| `packages/agent-cli/src/commands/deps.ts` | Add permission checks |
| `packages/agent-cli/src/commands/phase.ts` | Add permission checks |
| `packages/agent-cli/src/index.ts` | Add permissions command group |
| `packages/agent-shared/src/index.ts` | Add role types to protocol |
| `packages/agent-gateway/src/phase-prompts.ts` | Inject roles based on phase |
| `packages/container-daemon/src/execution.ts` | Pass roles to environment |
| `packages/frontend/src/components/TaskChat.tsx` | Show permission requests |

---

## Testing Strategy

### Unit Tests

```typescript
// packages/agent-cli/src/permissions/__tests__/checker.test.ts
describe('PermissionChecker', () => {
  test('requirements_gatherer can read own task', () => {
    const ctx = createContext({ roles: ['requirements_gatherer'], taskId: 'task1' });
    const checker = new PermissionChecker(ctx);
    expect(checker.check('task', 'read', 'task1')).toBe(true);
  });

  test('requirements_gatherer cannot read other task', () => {
    const ctx = createContext({ roles: ['requirements_gatherer'], taskId: 'task1' });
    const checker = new PermissionChecker(ctx);
    expect(checker.check('task', 'read', 'task2')).toBe(false);
  });

  test('implementer cannot create tasks', () => {
    const ctx = createContext({ roles: ['implementer'] });
    const checker = new PermissionChecker(ctx);
    expect(checker.check('task', 'create')).toBe(false);
  });
});
```

### Integration Tests

```typescript
// Test full flow with container
describe('RBAC Integration', () => {
  test('planning phase gets planner role', async () => {
    const task = await createTask({ phase: 'planning' });
    const container = await startContainer(task);

    // Verify environment has correct roles
    const env = await getContainerEnv(container);
    expect(JSON.parse(env.AGENT_ROLES)).toContain('planner');
  });

  test('permission denied logged to audit', async () => {
    // Execute command that should fail
    const result = await execInContainer('code-agent-tools task create ...');

    // Verify audit log entry
    const auditLogs = await getAuditLogs(task.id);
    expect(auditLogs).toContainEqual({
      resource: 'task',
      action: 'create',
      allowed: false,
    });
  });
});
```

---

## Rollout Plan

### Stage 1: Audit Mode (Week 1)
- Implement permission checking logic
- Log all checks to audit table
- **Do not enforce** - just log what would be denied
- Analyze logs to tune role definitions

### Stage 2: Soft Enforcement (Week 2)
- Enable enforcement for low-risk operations
- Keep audit logging
- Add permission request UI
- Monitor for false positives

### Stage 3: Full Enforcement (Week 3)
- Enable enforcement for all operations
- Enable user override mechanism
- Complete documentation
- Final testing

---

## Security Considerations

1. **Environment Variable Injection**: Roles are passed via environment variables. Container must be trusted not to modify these. Consider signing the context payload.

2. **Role Escalation**: Agents could request elevated roles. User approval required for sensitive roles (`task_manager`, `admin`).

3. **Audit Integrity**: Audit logs should be append-only. Consider write-only Convex function for audit entries.

4. **Override Expiration**: Time-bound overrides prevent forgotten elevated access. Default 1 hour, max 24 hours.

5. **Scope Validation**: Server-side validation in Convex should mirror CLI checks. Defense in depth.

---

## Open Questions

1. **Cross-project access**: Should any role allow reading tasks from other projects? Currently all roles are scoped to own project.

2. **Composite role limits**: Should there be a maximum number of roles an agent can have?

3. **Override inheritance**: If an override is granted for a session, should it apply to resumed sessions?

4. **Read vs sensitive read**: Should we distinguish between reading task metadata vs reading full content?

5. **Rate limiting**: Should permission checks be rate-limited to prevent enumeration attacks?

---

## Success Metrics

- **Zero security incidents** related to over-privileged agents
- **< 5% permission override requests** in normal operation (good role design)
- **< 100ms latency** added by permission checks
- **100% audit coverage** for all resource access
- **Clear error messages** when permissions denied (no agent confusion)
