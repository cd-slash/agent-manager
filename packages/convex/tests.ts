import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const testStatusValidator = v.union(
  v.literal("passed"),
  v.literal("pending"),
  v.literal("failed")
);

// List tests for a task
export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tests")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
  },
});

// Get test statistics for a task
export const getStats = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const tests = await ctx.db
      .query("tests")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    return {
      total: tests.length,
      passed: tests.filter((t) => t.status === "passed").length,
      pending: tests.filter((t) => t.status === "pending").length,
      failed: tests.filter((t) => t.status === "failed").length,
    };
  },
});

// Create a new test
export const create = mutation({
  args: {
    taskId: v.id("tasks"),
    name: v.string(),
    status: v.optional(testStatusValidator),
  },
  handler: async (ctx, args) => {
    // Verify task exists
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const testId = await ctx.db.insert("tests", {
      taskId: args.taskId,
      name: args.name,
      status: args.status ?? "pending",
    });

    return testId;
  },
});

// Update test status
export const updateStatus = mutation({
  args: {
    id: v.id("tests"),
    status: testStatusValidator,
    output: v.optional(v.string()),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Test not found");

    await ctx.db.patch(args.id, {
      status: args.status,
      output: args.output,
      duration: args.duration,
      runAt: Date.now(),
    });
  },
});

// Update test name
export const updateName = mutation({
  args: {
    id: v.id("tests"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Test not found");

    await ctx.db.patch(args.id, { name: args.name });
  },
});

// Delete a test
export const deleteTest = mutation({
  args: { id: v.id("tests") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Test not found");

    await ctx.db.delete(args.id);
  },
});

// Bulk create tests
export const bulkCreate = mutation({
  args: {
    taskId: v.id("tasks"),
    tests: v.array(
      v.object({
        name: v.string(),
        status: v.optional(testStatusValidator),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Verify task exists
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const ids = [];
    for (const test of args.tests) {
      const id = await ctx.db.insert("tests", {
        taskId: args.taskId,
        name: test.name,
        status: test.status ?? "pending",
      });
      ids.push(id);
    }

    return ids;
  },
});

// Run all tests for a task (marks them as running, actual execution would be done externally)
export const runAll = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const tests = await ctx.db
      .query("tests")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    for (const test of tests) {
      await ctx.db.patch(test._id, {
        status: "pending",
        output: undefined,
        duration: undefined,
        runAt: undefined,
      });
    }

    return tests.map((t) => t._id);
  },
});
