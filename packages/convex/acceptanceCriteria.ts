import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// List acceptance criteria for a task
export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const criteria = await ctx.db
      .query("acceptanceCriteria")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    return criteria.sort((a, b) => a.order - b.order);
  },
});

// Create new acceptance criteria
export const create = mutation({
  args: {
    taskId: v.id("tasks"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify task exists
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    // Get max order
    const existing = await ctx.db
      .query("acceptanceCriteria")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    const maxOrder = Math.max(0, ...existing.map((c) => c.order));

    const criteriaId = await ctx.db.insert("acceptanceCriteria", {
      taskId: args.taskId,
      text: args.text,
      done: false,
      order: maxOrder + 1,
    });

    return criteriaId;
  },
});

// Update acceptance criteria text
export const update = mutation({
  args: {
    id: v.id("acceptanceCriteria"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Acceptance criteria not found");

    await ctx.db.patch(args.id, { text: args.text });
  },
});

// Toggle acceptance criteria done status
export const toggleDone = mutation({
  args: { id: v.id("acceptanceCriteria") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Acceptance criteria not found");

    await ctx.db.patch(args.id, { done: !existing.done });
  },
});

// Set acceptance criteria done status explicitly
export const setDone = mutation({
  args: {
    id: v.id("acceptanceCriteria"),
    done: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Acceptance criteria not found");

    await ctx.db.patch(args.id, { done: args.done });
  },
});

// Delete acceptance criteria
export const deleteCriteria = mutation({
  args: { id: v.id("acceptanceCriteria") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Acceptance criteria not found");

    await ctx.db.delete(args.id);
  },
});

// Reorder acceptance criteria
export const reorder = mutation({
  args: {
    taskId: v.id("tasks"),
    criteriaIds: v.array(v.id("acceptanceCriteria")),
  },
  handler: async (ctx, args) => {
    for (let i = 0; i < args.criteriaIds.length; i++) {
      const id = args.criteriaIds[i]!;
      await ctx.db.patch(id, { order: i + 1 });
    }
  },
});

// Bulk create acceptance criteria
export const bulkCreate = mutation({
  args: {
    taskId: v.id("tasks"),
    items: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify task exists
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    // Get max order
    const existing = await ctx.db
      .query("acceptanceCriteria")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    let order = Math.max(0, ...existing.map((c) => c.order));

    const ids = [];
    for (const text of args.items) {
      order++;
      const id = await ctx.db.insert("acceptanceCriteria", {
        taskId: args.taskId,
        text,
        done: false,
        order,
      });
      ids.push(id);
    }

    return ids;
  },
});
