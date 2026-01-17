import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const categoryValidator = v.union(
  v.literal("backlog"),
  v.literal("todo"),
  v.literal("in-progress"),
  v.literal("done")
);

// List all tasks for a project
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// List tasks by category (for kanban view)
export const listByCategory = query({
  args: {
    projectId: v.id("projects"),
    category: categoryValidator,
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project_and_category", (q) =>
        q.eq("projectId", args.projectId).eq("category", args.category)
      )
      .collect();
    return tasks.sort((a, b) => a.order - b.order);
  },
});

// List all tasks with project info (for all tasks view)
export const listAllWithProjects = query({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    const tasksWithProjects = await Promise.all(
      tasks.map(async (task) => {
        const project = await ctx.db.get(task.projectId);
        return { ...task, project };
      })
    );
    return tasksWithProjects;
  },
});

// Get a single task with all related data
export const get = query({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return null;

    // Get acceptance criteria
    const acceptanceCriteria = await ctx.db
      .query("acceptanceCriteria")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();

    // Get tests
    const tests = await ctx.db
      .query("tests")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();

    // Get chat history
    const chatHistory = await ctx.db
      .query("chatMessages")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();

    // Get history events
    const history = await ctx.db
      .query("historyEvents")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();

    // Get dependencies
    const dependencyRecords = await ctx.db
      .query("taskDependencies")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    const dependencies = await Promise.all(
      dependencyRecords.map((d) => ctx.db.get(d.dependsOnTaskId))
    );

    // Get tasks that depend on this task (blocked by)
    const blockedByRecords = await ctx.db
      .query("taskDependencies")
      .withIndex("by_depends_on", (q) => q.eq("dependsOnTaskId", args.id))
      .collect();
    const blockedBy = await Promise.all(
      blockedByRecords.map((d) => ctx.db.get(d.taskId))
    );

    // Get pull request if exists
    const pullRequests = await ctx.db
      .query("pullRequests")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    const pullRequest = pullRequests[0] ?? null;

    return {
      ...task,
      acceptanceCriteria: acceptanceCriteria.sort((a, b) => a.order - b.order),
      tests,
      chatHistory: chatHistory.sort((a, b) => a.createdAt - b.createdAt),
      history: history.sort((a, b) => b.createdAt - a.createdAt),
      dependencies: dependencies.filter(Boolean),
      blockedBy: blockedBy.filter(Boolean),
      pullRequest,
    };
  },
});

// Get task dependencies
export const getDependencies = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const dependencyRecords = await ctx.db
      .query("taskDependencies")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    const dependencies = await Promise.all(
      dependencyRecords.map((d) => ctx.db.get(d.dependsOnTaskId))
    );
    return dependencies.filter(Boolean);
  },
});

// Get tasks that depend on this task
export const getBlockedBy = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const blockedByRecords = await ctx.db
      .query("taskDependencies")
      .withIndex("by_depends_on", (q) => q.eq("dependsOnTaskId", args.taskId))
      .collect();
    const blockedBy = await Promise.all(
      blockedByRecords.map((d) => ctx.db.get(d.taskId))
    );
    return blockedBy.filter(Boolean);
  },
});

// Create a new task
export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.string(),
    prompt: v.optional(v.string()),
    category: categoryValidator,
    tag: v.string(),
    complexity: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get max order for this category
    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_project_and_category", (q) =>
        q.eq("projectId", args.projectId).eq("category", args.category)
      )
      .collect();
    const maxOrder = Math.max(0, ...existingTasks.map((t) => t.order));

    const taskId = await ctx.db.insert("tasks", {
      projectId: args.projectId,
      title: args.title,
      description: args.description,
      prompt: args.prompt,
      category: args.category,
      tag: args.tag,
      complexity: args.complexity,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });

    return taskId;
  },
});

// Update a task
export const update = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    prompt: v.optional(v.string()),
    tag: v.optional(v.string()),
    complexity: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Task not found");

    // Filter out undefined values
    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }

    await ctx.db.patch(id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

// Update task category (move between columns)
export const updateCategory = mutation({
  args: {
    id: v.id("tasks"),
    category: categoryValidator,
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Task not found");

    let newOrder = args.order;
    if (newOrder === undefined) {
      // Get max order for new category
      const existingTasks = await ctx.db
        .query("tasks")
        .withIndex("by_project_and_category", (q) =>
          q.eq("projectId", existing.projectId).eq("category", args.category)
        )
        .collect();
      newOrder = Math.max(0, ...existingTasks.map((t) => t.order)) + 1;
    }

    await ctx.db.patch(args.id, {
      category: args.category,
      order: newOrder,
      updatedAt: Date.now(),
    });
  },
});

// Add a dependency to a task
export const addDependency = mutation({
  args: {
    taskId: v.id("tasks"),
    dependsOnTaskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    // Check both tasks exist
    const task = await ctx.db.get(args.taskId);
    const dependsOn = await ctx.db.get(args.dependsOnTaskId);
    if (!task || !dependsOn) throw new Error("Task not found");

    // Check if dependency already exists
    const existing = await ctx.db
      .query("taskDependencies")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.eq(q.field("dependsOnTaskId"), args.dependsOnTaskId))
      .first();

    if (existing) return existing._id;

    const dependencyId = await ctx.db.insert("taskDependencies", {
      taskId: args.taskId,
      dependsOnTaskId: args.dependsOnTaskId,
    });

    return dependencyId;
  },
});

// Remove a dependency from a task
export const removeDependency = mutation({
  args: {
    taskId: v.id("tasks"),
    dependsOnTaskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const dependency = await ctx.db
      .query("taskDependencies")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.eq(q.field("dependsOnTaskId"), args.dependsOnTaskId))
      .first();

    if (dependency) {
      await ctx.db.delete(dependency._id);
    }
  },
});

// Reorder tasks within a category
export const reorder = mutation({
  args: {
    projectId: v.id("projects"),
    category: categoryValidator,
    taskIds: v.array(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    for (let i = 0; i < args.taskIds.length; i++) {
      await ctx.db.patch(args.taskIds[i], {
        order: i + 1,
        updatedAt: Date.now(),
      });
    }
  },
});

// Delete a task
export const deleteTask = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");

    // Delete dependencies where this task is the dependent
    const deps = await ctx.db
      .query("taskDependencies")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const dep of deps) {
      await ctx.db.delete(dep._id);
    }

    // Delete dependencies where this task is depended upon
    const blockedBy = await ctx.db
      .query("taskDependencies")
      .withIndex("by_depends_on", (q) => q.eq("dependsOnTaskId", args.id))
      .collect();
    for (const dep of blockedBy) {
      await ctx.db.delete(dep._id);
    }

    // Delete acceptance criteria
    const criteria = await ctx.db
      .query("acceptanceCriteria")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const c of criteria) {
      await ctx.db.delete(c._id);
    }

    // Delete tests
    const tests = await ctx.db
      .query("tests")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const t of tests) {
      await ctx.db.delete(t._id);
    }

    // Delete chat messages
    const chats = await ctx.db
      .query("chatMessages")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const chat of chats) {
      await ctx.db.delete(chat._id);
    }

    // Delete history events
    const history = await ctx.db
      .query("historyEvents")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const event of history) {
      await ctx.db.delete(event._id);
    }

    // Delete pull requests and related data
    const pullRequests = await ctx.db
      .query("pullRequests")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const pr of pullRequests) {
      // Delete PR comments
      const comments = await ctx.db
        .query("prComments")
        .withIndex("by_pull_request", (q) => q.eq("pullRequestId", pr._id))
        .collect();
      for (const comment of comments) {
        await ctx.db.delete(comment._id);
      }

      // Delete PR issues
      const issues = await ctx.db
        .query("prIssues")
        .withIndex("by_pull_request", (q) => q.eq("pullRequestId", pr._id))
        .collect();
      for (const issue of issues) {
        await ctx.db.delete(issue._id);
      }

      // Delete PR checks
      const checks = await ctx.db
        .query("prChecks")
        .withIndex("by_pull_request", (q) => q.eq("pullRequestId", pr._id))
        .collect();
      for (const check of checks) {
        await ctx.db.delete(check._id);
      }

      await ctx.db.delete(pr._id);
    }

    // Finally delete the task
    await ctx.db.delete(args.id);
  },
});
