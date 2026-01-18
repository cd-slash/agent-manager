import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new agent session
export const create = mutation({
  args: {
    sessionId: v.string(),
    containerId: v.string(),
    prompt: v.string(),
    taskId: v.optional(v.id("tasks")),
    projectId: v.optional(v.id("projects")),
    status: v.union(
      v.literal("starting"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    startedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentSessions", {
      sessionId: args.sessionId,
      containerId: args.containerId,
      prompt: args.prompt,
      taskId: args.taskId,
      projectId: args.projectId,
      status: args.status,
      startedAt: args.startedAt,
    });
  },
});

// Update session status
export const updateStatus = mutation({
  args: {
    sessionId: v.string(),
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
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("agentSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session) {
      throw new Error(`Session not found: ${args.sessionId}`);
    }

    const updates: Record<string, unknown> = { status: args.status };

    if (args.result !== undefined) updates.result = args.result;
    if (args.error !== undefined) updates.error = args.error;
    if (args.totalCostUsd !== undefined) updates.totalCostUsd = args.totalCostUsd;
    if (args.numTurns !== undefined) updates.numTurns = args.numTurns;
    if (args.completedAt !== undefined) updates.completedAt = args.completedAt;

    await ctx.db.patch(session._id, updates);
    return session._id;
  },
});

// Get session by sessionId
export const getBySessionId = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});

// List sessions by container
export const listByContainer = query({
  args: { containerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentSessions")
      .withIndex("by_container", (q) => q.eq("containerId", args.containerId))
      .order("desc")
      .collect();
  },
});

// List sessions by task
export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentSessions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .collect();
  },
});

// List sessions by project
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentSessions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

// List active sessions
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const starting = await ctx.db
      .query("agentSessions")
      .withIndex("by_status", (q) => q.eq("status", "starting"))
      .collect();

    const running = await ctx.db
      .query("agentSessions")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    return [...starting, ...running].sort((a, b) => b.startedAt - a.startedAt);
  },
});

// List recent sessions
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("agentSessions")
      .order("desc")
      .take(limit);
  },
});
