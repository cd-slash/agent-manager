import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

// Record a history event (internal use only)
export const recordEvent = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    action: v.string(),
    user: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const eventId = await ctx.db.insert("historyEvents", {
      projectId: args.projectId,
      taskId: args.taskId,
      action: args.action,
      user: args.user,
      metadata: args.metadata,
      createdAt: Date.now(),
    });

    return eventId;
  },
});

// Get recent history for a project
export const getProjectHistory = internalQuery({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const events = await ctx.db
      .query("historyEvents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return events
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },
});

// Get recent history for a task
export const getTaskHistory = internalQuery({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const events = await ctx.db
      .query("historyEvents")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    return events
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },
});

// Clean up old history events
export const cleanupOldEvents = internalMutation({
  args: { olderThanDays: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;

    const oldEvents = await ctx.db
      .query("historyEvents")
      .filter((q) => q.lt(q.field("createdAt"), cutoff))
      .collect();

    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
    }

    return oldEvents.length;
  },
});
