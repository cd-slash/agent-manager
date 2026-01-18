# Agent System Design

This document describes the AI agent integration architecture for the Agent Manager platform. The system is designed to orchestrate multiple AI coding agents, track their work, and facilitate human-AI collaboration on software development tasks.

## Overview

The Agent Manager serves as a control plane for AI coding agents, providing:

- **Task Assignment**: Dispatch tasks to AI agents with full context
- **Progress Tracking**: Monitor agent work in real-time
- **Conversation Interface**: Chat with agents at project and task levels
- **Code Review Integration**: Manage agent-created pull requests
- **Feedback Loop**: Human review and correction of agent outputs

## Agent Interaction Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AGENT MANAGER UI                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Project   │  │    Task     │  │    Chat     │  │     PR      │    │
│  │    View     │  │    View     │  │   Panel     │  │   Review    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CONVEX BACKEND                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  agentJobs  │  │chatMessages │  │    tasks    │  │ pullRequests│    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   AI Agent 1    │  │   AI Agent 2    │  │   AI Agent N    │
│  (Claude Code)  │  │   (Codex)       │  │  (Custom Agent) │
└─────────────────┘  └─────────────────┘  └─────────────────┘
            │                  │                  │
            └──────────────────┴──────────────────┘
                               │
                               ▼
                    ┌─────────────────┐
                    │  GitHub/GitLab  │
                    │   Repository    │
                    └─────────────────┘
```

## Data Model

### Agent Jobs Table

The `agentJobs` table tracks all work assigned to AI agents:

```typescript
agentJobs: defineTable({
  taskId: v.id("tasks"),              // Associated task
  agentType: v.string(),              // "claude-code", "codex", "custom"
  status: v.union(
    v.literal("queued"),              // Waiting to start
    v.literal("running"),             // Agent actively working
    v.literal("completed"),           // Successfully finished
    v.literal("failed"),              // Error occurred
    v.literal("cancelled")            // Manually stopped
  ),
  prompt: v.string(),                 // Initial prompt sent to agent
  result: v.optional(v.string()),     // Agent's final output
  error: v.optional(v.string()),      // Error message if failed
  startedAt: v.optional(v.number()),  // When agent began work
  completedAt: v.optional(v.number()),// When agent finished
  createdAt: v.number(),
})
  .index("by_task", ["taskId"])
  .index("by_status", ["status"])
```

### Chat Messages Table

Chat messages support both project-level and task-level conversations:

```typescript
chatMessages: defineTable({
  projectId: v.optional(v.id("projects")),  // Project-level chat
  taskId: v.optional(v.id("tasks")),        // Task-level chat
  sender: v.union(v.literal("user"), v.literal("ai")),
  text: v.string(),
  createdAt: v.number(),
})
  .index("by_project", ["projectId"])
  .index("by_task", ["taskId"])
```

## Agent Job Lifecycle

### 1. Job Creation

When a user assigns work to an agent:

```typescript
// tasks.ts - Assign agent to task
export const assignAgent = mutation({
  args: {
    taskId: v.id("tasks"),
    agentType: v.string(),
    prompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    // Build prompt from task context
    const prompt = args.prompt || buildAgentPrompt(task);

    // Create job record
    const jobId = await ctx.db.insert("agentJobs", {
      taskId: args.taskId,
      agentType: args.agentType,
      status: "queued",
      prompt,
      createdAt: Date.now(),
    });

    // Update task status
    await ctx.db.patch(args.taskId, {
      category: "in-progress",
      updatedAt: Date.now(),
    });

    // Trigger agent via external service
    await ctx.scheduler.runAfter(0, internal.internal.aiResponses.dispatchAgent, {
      jobId,
    });

    return jobId;
  },
});
```

### 2. Agent Dispatch

The internal action calls the external agent service:

```typescript
// internal/aiResponses.ts
export const dispatchAgent = internalAction({
  args: { jobId: v.id("agentJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.internal.aiResponses.getJob, {
      jobId: args.jobId,
    });

    // Mark as running
    await ctx.runMutation(internal.internal.aiResponses.updateJobStatus, {
      jobId: args.jobId,
      status: "running",
      startedAt: Date.now(),
    });

    // Call external agent API
    // The agent will call back to /webhooks/agent/callback when done
    await fetch(process.env.AGENT_DISPATCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.AGENT_API_KEY}`,
      },
      body: JSON.stringify({
        jobId: args.jobId,
        taskId: job.taskId,
        prompt: job.prompt,
        callbackUrl: `${process.env.CONVEX_SITE_URL}/webhooks/agent/callback`,
      }),
    });
  },
});
```

### 3. Agent Callback

When the agent completes, it calls back with results:

```typescript
// http.ts - Agent callback endpoint
const agentCallback = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { jobId, status, result, error } = body;

  // Store the raw webhook
  await ctx.runMutation(internal.webhooks.store, {
    source: "agent",
    payload: JSON.stringify(body),
    status: "pending",
  });

  // Process the callback
  await ctx.scheduler.runAfter(0, internal.internal.webhookProcessing.processAgentCallback, {
    jobId,
    status,
    result,
    error,
  });

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

### 4. Result Processing

```typescript
// internal/webhookProcessing.ts
export const processAgentCallback = internalMutation({
  args: {
    jobId: v.id("agentJobs"),
    status: v.string(),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    // Update job status
    await ctx.db.patch(args.jobId, {
      status: args.status === "success" ? "completed" : "failed",
      result: args.result,
      error: args.error,
      completedAt: Date.now(),
    });

    // If successful, may create PR
    if (args.status === "success" && args.result) {
      const resultData = JSON.parse(args.result);
      if (resultData.prUrl) {
        await ctx.db.insert("pullRequests", {
          taskId: job.taskId,
          prNumber: resultData.prNumber,
          prUrl: resultData.prUrl,
          title: resultData.prTitle,
          status: "open",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    // Record in history
    await ctx.scheduler.runAfter(0, internal.internal.history.recordEvent, {
      taskId: job.taskId,
      action: args.status === "success"
        ? "Agent completed work"
        : `Agent failed: ${args.error}`,
      user: "agent",
    });
  },
});
```

## Chat System

### Architecture

The chat system supports contextual conversations:

```
┌─────────────────────────────────────────────────────────────┐
│                      Chat Panel                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [AI] I've analyzed the codebase. The auth module    │   │
│  │      needs refactoring to support OAuth2.           │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [User] Can you create acceptance criteria for this? │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [AI] Sure! I've added 5 acceptance criteria:        │   │
│  │      1. OAuth2 provider configuration               │   │
│  │      2. Token refresh handling...                   │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  [Type a message...]                          [Send]        │
└─────────────────────────────────────────────────────────────┘
```

### Context Levels

**Project-level Chat**: High-level planning and specification discussions

```typescript
// Query project chat
const messages = useQuery(api.chat.listByProject, { projectId });

// Send project message
await sendProjectMessage({
  projectId,
  text: "What's the best approach for implementing caching?",
  sender: "user",
});
```

**Task-level Chat**: Focused discussion on specific implementation

```typescript
// Query task chat
const messages = useQuery(api.chat.listByTask, { taskId });

// Send task message
await sendTaskMessage({
  taskId,
  text: "The tests are failing, can you investigate?",
  sender: "user",
});
```

### AI Response Generation

When a user sends a message, the system can trigger AI response generation:

```typescript
// chat.ts
export const sendTaskMessage = mutation({
  args: {
    taskId: v.id("tasks"),
    text: v.string(),
    sender: v.union(v.literal("user"), v.literal("ai")),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("chatMessages", {
      taskId: args.taskId,
      sender: args.sender,
      text: args.text,
      createdAt: Date.now(),
    });

    // If user message, optionally trigger AI response
    if (args.sender === "user") {
      await ctx.scheduler.runAfter(0, internal.internal.aiResponses.generateChatResponse, {
        messageId,
      });
    }

    return messageId;
  },
});
```

### Context Loading

AI responses include relevant context:

```typescript
// internal/aiResponses.ts
export const loadChatContext = internalQuery({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;

    let context = {
      recentMessages: [] as ChatMessage[],
      task: null as Task | null,
      project: null as Project | null,
      acceptanceCriteria: [] as AcceptanceCriteria[],
    };

    // Load task context
    if (message.taskId) {
      context.task = await ctx.db.get(message.taskId);

      // Load acceptance criteria
      context.acceptanceCriteria = await ctx.db
        .query("acceptanceCriteria")
        .withIndex("by_task", q => q.eq("taskId", message.taskId))
        .collect();

      // Load recent task messages
      context.recentMessages = await ctx.db
        .query("chatMessages")
        .withIndex("by_task", q => q.eq("taskId", message.taskId))
        .order("desc")
        .take(10);

      // Load project
      if (context.task) {
        context.project = await ctx.db.get(context.task.projectId);
      }
    }

    // Load project context
    if (message.projectId) {
      context.project = await ctx.db.get(message.projectId);

      context.recentMessages = await ctx.db
        .query("chatMessages")
        .withIndex("by_project", q => q.eq("projectId", message.projectId))
        .order("desc")
        .take(10);
    }

    return context;
  },
});
```

## Pull Request Integration

### PR Lifecycle

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Agent   │────▶│   Open   │────▶│ Review   │────▶│  Merged  │
│ Creates  │     │    PR    │     │ Process  │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                │
                      ▼                ▼
               ┌──────────┐     ┌──────────┐
               │  Issues  │     │ Changes  │
               │ Detected │     │Requested │
               └──────────┘     └──────────┘
```

### Code Review Features

**AI-Detected Issues**: The system can analyze PRs for potential problems:

```typescript
prIssues: defineTable({
  pullRequestId: v.id("pullRequests"),
  severity: v.union(v.literal("error"), v.literal("warning"), v.literal("info")),
  file: v.string(),
  line: v.optional(v.number()),
  message: v.string(),
  suggestion: v.optional(v.string()),
  resolved: v.boolean(),
  createdAt: v.number(),
})
```

**CI/CD Checks**: Track external CI/CD results:

```typescript
prChecks: defineTable({
  pullRequestId: v.id("pullRequests"),
  name: v.string(),           // "tests", "lint", "build"
  status: v.union(
    v.literal("pending"),
    v.literal("running"),
    v.literal("passed"),
    v.literal("failed")
  ),
  url: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

### GitHub Webhook Integration

GitHub webhooks update PR status in real-time:

```typescript
// internal/webhookProcessing.ts
export const processGithubWebhook = internalMutation({
  args: { eventId: v.id("webhookEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    const payload = JSON.parse(event.payload);

    switch (payload.action) {
      case "opened":
        // New PR opened - may match existing task
        break;

      case "closed":
        if (payload.pull_request.merged) {
          // PR merged - update task status
          const pr = await ctx.db
            .query("pullRequests")
            .withIndex("by_pr_number", q => q.eq("prNumber", payload.number))
            .first();

          if (pr) {
            await ctx.db.patch(pr._id, { status: "merged" });
            await ctx.db.patch(pr.taskId, { category: "done" });
          }
        }
        break;

      case "review_submitted":
        // Code review submitted
        break;
    }

    await ctx.db.patch(args.eventId, { status: "processed" });
  },
});
```

## Agent Types

The system is designed to support multiple AI agent backends:

### Supported Agents

| Agent | Use Case | Integration |
|-------|----------|-------------|
| **Claude Code** | Complex coding tasks, refactoring | CLI tool with callback |
| **GitHub Copilot** | Code suggestions, completions | VS Code extension API |
| **Custom Agents** | Specialized tasks | HTTP callback API |

### Agent Configuration

```typescript
// Example agent configuration (stored in environment)
const agentConfigs = {
  "claude-code": {
    dispatchUrl: "https://agent-runner.example.com/claude",
    timeout: 30 * 60 * 1000,  // 30 minutes
    capabilities: ["refactor", "implement", "test", "review"],
  },
  "quick-fix": {
    dispatchUrl: "https://agent-runner.example.com/quickfix",
    timeout: 5 * 60 * 1000,   // 5 minutes
    capabilities: ["fix-bug", "add-test"],
  },
};
```

## Security Considerations

### Authentication

- Webhook endpoints validate signatures (GitHub webhook secret)
- Agent callbacks include job ID that must exist in database
- API keys stored in Convex environment variables

### Authorization

- Agent jobs are scoped to specific tasks
- Agents only receive context for their assigned task
- PR operations require matching task ownership

### Rate Limiting

- Webhook endpoints should implement rate limiting
- Agent dispatch has configurable concurrency limits
- Chat AI responses can be throttled per user/project

## Monitoring

### Job Metrics

Track agent performance:

```typescript
// Query for agent analytics
export const getAgentStats = query({
  args: { since: v.number() },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("agentJobs")
      .filter(q => q.gte(q.field("createdAt"), args.since))
      .collect();

    return {
      total: jobs.length,
      completed: jobs.filter(j => j.status === "completed").length,
      failed: jobs.filter(j => j.status === "failed").length,
      avgDuration: calculateAvgDuration(jobs),
      byAgent: groupByAgent(jobs),
    };
  },
});
```

### Error Tracking

Failed jobs are logged with full context for debugging:

```typescript
// View failed jobs
export const listFailedJobs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentJobs")
      .withIndex("by_status", q => q.eq("status", "failed"))
      .order("desc")
      .take(args.limit ?? 50);
  },
});
```

## Future Enhancements

### Planned Features

1. **Multi-Agent Collaboration**: Multiple agents working on related tasks
2. **Agent Memory**: Long-term memory across sessions using vector storage
3. **Human-in-the-Loop**: Approval gates for critical agent actions
4. **Cost Tracking**: Monitor API usage and costs per project
5. **Agent Marketplace**: Plugin system for custom agent integrations

### Extension Points

The architecture supports easy extension:

- Add new agent types by implementing the dispatch/callback interface
- Custom context loaders for domain-specific knowledge
- Pluggable code review analyzers
- Webhook handlers for additional services (Jira, Linear, etc.)
