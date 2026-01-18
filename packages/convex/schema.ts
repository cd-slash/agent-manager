import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Settings table - global app settings (credentials, config)
  settings: defineTable({
    key: v.string(),
    value: v.any(),
    lastValidated: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // Projects table - project metadata and plan
  projects: defineTable({
    name: v.string(),
    description: v.string(),
    plan: v.optional(v.string()),
    archived: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_archived", ["archived"])
    .index("by_name", ["name"]),

  // Tasks table - tasks with status, PR info
  tasks: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    description: v.string(),
    prompt: v.optional(v.string()),
    category: v.union(
      v.literal("backlog"),
      v.literal("todo"),
      v.literal("in-progress"),
      v.literal("done")
    ),
    tag: v.string(),
    complexity: v.string(),
    order: v.number(), // For ordering within a category
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_category", ["projectId", "category"]),

  // Task dependencies - many-to-many relationship
  taskDependencies: defineTable({
    taskId: v.id("tasks"),
    dependsOnTaskId: v.id("tasks"),
  })
    .index("by_task", ["taskId"])
    .index("by_depends_on", ["dependsOnTaskId"]),

  // Acceptance criteria - checklist items per task
  acceptanceCriteria: defineTable({
    taskId: v.id("tasks"),
    text: v.string(),
    done: v.boolean(),
    order: v.number(),
  }).index("by_task", ["taskId"]),

  // Tests - test results per task
  tests: defineTable({
    taskId: v.id("tasks"),
    name: v.string(),
    status: v.union(
      v.literal("passed"),
      v.literal("pending"),
      v.literal("failed")
    ),
    output: v.optional(v.string()),
    duration: v.optional(v.number()), // in milliseconds
    runAt: v.optional(v.number()),
  })
    .index("by_task", ["taskId"])
    .index("by_task_and_status", ["taskId", "status"]),

  // Chat messages - AI/user messages (project or task level)
  chatMessages: defineTable({
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    sender: v.union(v.literal("ai"), v.literal("user")),
    text: v.string(),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"]),

  // History events - audit trail
  historyEvents: defineTable({
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    action: v.string(),
    user: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"]),

  // Pull requests - PR metadata, review status
  pullRequests: defineTable({
    taskId: v.id("tasks"),
    prNumber: v.number(),
    title: v.string(),
    description: v.optional(v.string()),
    branch: v.string(),
    baseBranch: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("review_requested"),
      v.literal("changes_requested"),
      v.literal("approved"),
      v.literal("merged"),
      v.literal("closed")
    ),
    url: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_status", ["status"]),

  // PR comments - comments on PRs
  prComments: defineTable({
    pullRequestId: v.id("pullRequests"),
    author: v.string(),
    body: v.string(),
    filePath: v.optional(v.string()),
    lineNumber: v.optional(v.number()),
    resolved: v.boolean(),
    createdAt: v.number(),
  }).index("by_pull_request", ["pullRequestId"]),

  // PR issues - AI-detected code issues
  prIssues: defineTable({
    pullRequestId: v.id("pullRequests"),
    severity: v.union(
      v.literal("error"),
      v.literal("warning"),
      v.literal("info")
    ),
    title: v.string(),
    description: v.string(),
    filePath: v.string(),
    lineNumber: v.optional(v.number()),
    suggestion: v.optional(v.string()),
    resolved: v.boolean(),
    createdAt: v.number(),
  }).index("by_pull_request", ["pullRequestId"]),

  // PR checks - CI/CD check results
  prChecks: defineTable({
    pullRequestId: v.id("pullRequests"),
    name: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("passed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    url: v.optional(v.string()),
    output: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  }).index("by_pull_request", ["pullRequestId"]),

  // Servers - server infrastructure
  servers: defineTable({
    name: v.string(),
    ip: v.string(),
    region: v.string(),
    status: v.union(
      v.literal("online"),
      v.literal("maintenance"),
      v.literal("offline")
    ),
    cpu: v.number(), // percentage 0-100
    mem: v.number(), // percentage 0-100
    // Tailscale integration fields
    tailscaleNodeId: v.optional(v.string()),
    tailscaleHostname: v.optional(v.string()),
    tailscaleTags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_region", ["region"])
    .index("by_tailscale_node_id", ["tailscaleNodeId"]),

  // Containers - Docker containers (also used for Tailscale code-agent devices)
  containers: defineTable({
    serverId: v.optional(v.id("servers")), // Optional for Tailscale-managed containers
    containerId: v.string(), // Docker container ID
    name: v.string(),
    image: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("stopped"),
      v.literal("restarting"),
      v.literal("paused"),
      v.literal("exited")
    ),
    port: v.string(),
    // Tailscale integration fields
    tailscaleNodeId: v.optional(v.string()),
    tailscaleHostname: v.optional(v.string()),
    tailscaleTags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_server", ["serverId"])
    .index("by_status", ["status"])
    .index("by_tailscale_node_id", ["tailscaleNodeId"]),

  // Server metrics - time-series metrics
  serverMetrics: defineTable({
    serverId: v.id("servers"),
    cpu: v.number(),
    mem: v.number(),
    networkIn: v.optional(v.number()),
    networkOut: v.optional(v.number()),
    diskUsage: v.optional(v.number()),
    timestamp: v.number(),
  }).index("by_server_and_timestamp", ["serverId", "timestamp"]),

  // Webhook events - incoming webhook storage
  webhookEvents: defineTable({
    source: v.union(
      v.literal("github"),
      v.literal("cicd"),
      v.literal("agent"),
      v.literal("tailscale")
    ),
    eventType: v.string(),
    payload: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed")
    ),
    errorMessage: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    retryCount: v.number(),
    createdAt: v.number(),
  }).index("by_source_and_status", ["source", "status"]),

  // Agent jobs - AI job tracking
  agentJobs: defineTable({
    taskId: v.optional(v.id("tasks")),
    pullRequestId: v.optional(v.id("pullRequests")),
    type: v.union(
      v.literal("chat_response"),
      v.literal("task_analysis"),
      v.literal("code_review"),
      v.literal("auto_fix")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_status", ["status"]),

  // Agent sessions - Claude Code CLI sessions via agent-gateway
  agentSessions: defineTable({
    sessionId: v.string(), // UUID from gateway
    containerId: v.string(), // Container running the session
    taskId: v.optional(v.id("tasks")),
    projectId: v.optional(v.id("projects")),
    prompt: v.string(), // Initial prompt sent to CLI
    status: v.union(
      v.literal("starting"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    result: v.optional(v.string()), // Final result text
    error: v.optional(v.string()), // Error message if failed
    totalCostUsd: v.optional(v.number()),
    numTurns: v.optional(v.number()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_session_id", ["sessionId"])
    .index("by_container", ["containerId"])
    .index("by_task", ["taskId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["status"]),

  // Agent messages - streaming output from Claude Code CLI
  agentMessages: defineTable({
    sessionId: v.string(), // References agentSessions.sessionId
    messageType: v.union(
      v.literal("assistant"),
      v.literal("result"),
      v.literal("system")
    ),
    content: v.string(), // JSON stringified CliOutputMessage
    timestamp: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_timestamp", ["sessionId", "timestamp"]),
});
