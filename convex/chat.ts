import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const senderValidator = v.union(v.literal("ai"), v.literal("user"));

// List chat messages for a project
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    // Filter to project-level messages only (no task association)
    return messages
      .filter((m) => m.taskId === undefined)
      .sort((a, b) => a.createdAt - b.createdAt);
  },
});

// List chat messages for a task
export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    return messages.sort((a, b) => a.createdAt - b.createdAt);
  },
});

// Send a message at project level
export const sendProjectMessage = mutation({
  args: {
    projectId: v.id("projects"),
    text: v.string(),
    sender: senderValidator,
  },
  handler: async (ctx, args) => {
    // Verify project exists
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const messageId = await ctx.db.insert("chatMessages", {
      projectId: args.projectId,
      taskId: undefined,
      sender: args.sender,
      text: args.text,
      createdAt: Date.now(),
    });

    return messageId;
  },
});

// Send a message at task level
export const sendTaskMessage = mutation({
  args: {
    taskId: v.id("tasks"),
    text: v.string(),
    sender: senderValidator,
  },
  handler: async (ctx, args) => {
    // Verify task exists and get project ID
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const messageId = await ctx.db.insert("chatMessages", {
      projectId: task.projectId,
      taskId: args.taskId,
      sender: args.sender,
      text: args.text,
      createdAt: Date.now(),
    });

    return messageId;
  },
});

// Delete a chat message
export const deleteMessage = mutation({
  args: { id: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Message not found");

    await ctx.db.delete(args.id);
  },
});

// Clear all messages for a project (project-level only)
export const clearProjectMessages = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Only clear project-level messages (not task messages)
    for (const message of messages) {
      if (message.taskId === undefined) {
        await ctx.db.delete(message._id);
      }
    }
  },
});

// Clear all messages for a task
export const clearTaskMessages = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
  },
});

// Get recent messages across all projects/tasks (for dashboard)
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const messages = await ctx.db.query("chatMessages").order("desc").take(limit);

    // Enrich with project/task names
    const enriched = await Promise.all(
      messages.map(async (message) => {
        const project = message.projectId
          ? await ctx.db.get(message.projectId)
          : null;
        const task = message.taskId ? await ctx.db.get(message.taskId) : null;
        return {
          ...message,
          projectName: project?.name,
          taskTitle: task?.title,
        };
      })
    );

    return enriched;
  },
});
