import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// List all non-archived projects
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
  },
});

// List all projects including archived
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("projects").collect();
  },
});

// List archived projects only
export const listArchived = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_archived", (q) => q.eq("archived", true))
      .collect();
  },
});

// Get project by ID
export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get project with task statistics
export const getWithStats = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) return null;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();

    const stats = {
      total: tasks.length,
      backlog: tasks.filter((t) => t.category === "backlog").length,
      todo: tasks.filter((t) => t.category === "todo").length,
      inProgress: tasks.filter((t) => t.category === "in-progress").length,
      done: tasks.filter((t) => t.category === "done").length,
    };

    return { ...project, stats };
  },
});

// Create new project
export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    plan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      description: args.description,
      plan: args.plan,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
    return projectId;
  },
});

// Update project details
export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Project not found");

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

// Update project plan/specification
export const updatePlan = mutation({
  args: {
    id: v.id("projects"),
    plan: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Project not found");

    await ctx.db.patch(args.id, {
      plan: args.plan,
      updatedAt: Date.now(),
    });
  },
});

// Archive a project
export const archive = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Project not found");

    await ctx.db.patch(args.id, {
      archived: true,
      updatedAt: Date.now(),
    });
  },
});

// Restore an archived project
export const restore = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Project not found");

    await ctx.db.patch(args.id, {
      archived: false,
      updatedAt: Date.now(),
    });
  },
});

// Delete a project and all related data
export const deleteProject = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Project not found");

    // Delete all related tasks first
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();

    for (const task of tasks) {
      // Delete task dependencies
      const deps = await ctx.db
        .query("taskDependencies")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      for (const dep of deps) {
        await ctx.db.delete(dep._id);
      }

      // Delete acceptance criteria
      const criteria = await ctx.db
        .query("acceptanceCriteria")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      for (const c of criteria) {
        await ctx.db.delete(c._id);
      }

      // Delete tests
      const tests = await ctx.db
        .query("tests")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      for (const t of tests) {
        await ctx.db.delete(t._id);
      }

      // Delete chat messages for task
      const taskChats = await ctx.db
        .query("chatMessages")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      for (const chat of taskChats) {
        await ctx.db.delete(chat._id);
      }

      // Delete history events for task
      const taskHistory = await ctx.db
        .query("historyEvents")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      for (const event of taskHistory) {
        await ctx.db.delete(event._id);
      }

      await ctx.db.delete(task._id);
    }

    // Delete project-level chat messages
    const projectChats = await ctx.db
      .query("chatMessages")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const chat of projectChats) {
      await ctx.db.delete(chat._id);
    }

    // Delete project-level history events
    const projectHistory = await ctx.db
      .query("historyEvents")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const event of projectHistory) {
      await ctx.db.delete(event._id);
    }

    // Finally delete the project
    await ctx.db.delete(args.id);
  },
});
