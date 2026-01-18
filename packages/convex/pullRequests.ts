import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  prStatusValidator,
  checkStatusValidator,
  issueSeverityValidator,
} from "./validators";
import { patchWithTimestamp } from "./internal/updateUtils";

// Get pull request by task
export const getByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const prs = await ctx.db
      .query("pullRequests")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    return prs[0] ?? null;
  },
});

// Get pull request with all related data
export const getWithDetails = query({
  args: { id: v.id("pullRequests") },
  handler: async (ctx, args) => {
    const pr = await ctx.db.get(args.id);
    if (!pr) return null;

    const comments = await ctx.db
      .query("prComments")
      .withIndex("by_pull_request", (q) => q.eq("pullRequestId", args.id))
      .collect();

    const issues = await ctx.db
      .query("prIssues")
      .withIndex("by_pull_request", (q) => q.eq("pullRequestId", args.id))
      .collect();

    const checks = await ctx.db
      .query("prChecks")
      .withIndex("by_pull_request", (q) => q.eq("pullRequestId", args.id))
      .collect();

    return {
      ...pr,
      comments: comments.sort((a, b) => a.createdAt - b.createdAt),
      issues,
      checks,
    };
  },
});

// List comments for a PR
export const listComments = query({
  args: { pullRequestId: v.id("pullRequests") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("prComments")
      .withIndex("by_pull_request", (q) =>
        q.eq("pullRequestId", args.pullRequestId)
      )
      .collect();
    return comments.sort((a, b) => a.createdAt - b.createdAt);
  },
});

// List issues for a PR
export const listIssues = query({
  args: { pullRequestId: v.id("pullRequests") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("prIssues")
      .withIndex("by_pull_request", (q) =>
        q.eq("pullRequestId", args.pullRequestId)
      )
      .collect();
  },
});

// List checks for a PR
export const listChecks = query({
  args: { pullRequestId: v.id("pullRequests") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("prChecks")
      .withIndex("by_pull_request", (q) =>
        q.eq("pullRequestId", args.pullRequestId)
      )
      .collect();
  },
});

// List PRs by status
export const listByStatus = query({
  args: { status: prStatusValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pullRequests")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});

// Create a new pull request
export const create = mutation({
  args: {
    taskId: v.id("tasks"),
    prNumber: v.number(),
    title: v.string(),
    description: v.optional(v.string()),
    branch: v.string(),
    baseBranch: v.string(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify task exists
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const now = Date.now();
    const prId = await ctx.db.insert("pullRequests", {
      taskId: args.taskId,
      prNumber: args.prNumber,
      title: args.title,
      description: args.description,
      branch: args.branch,
      baseBranch: args.baseBranch,
      status: "draft",
      url: args.url,
      createdAt: now,
      updatedAt: now,
    });

    return prId;
  },
});

// Update PR status
export const updateStatus = mutation({
  args: {
    id: v.id("pullRequests"),
    status: prStatusValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Pull request not found");

    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// Update PR details
export const update = mutation({
  args: {
    id: v.id("pullRequests"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Pull request not found");

    await patchWithTimestamp(ctx.db, id, updates);
  },
});

// Add a comment to PR
export const addComment = mutation({
  args: {
    pullRequestId: v.id("pullRequests"),
    author: v.string(),
    body: v.string(),
    filePath: v.optional(v.string()),
    lineNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pr = await ctx.db.get(args.pullRequestId);
    if (!pr) throw new Error("Pull request not found");

    const commentId = await ctx.db.insert("prComments", {
      pullRequestId: args.pullRequestId,
      author: args.author,
      body: args.body,
      filePath: args.filePath,
      lineNumber: args.lineNumber,
      resolved: false,
      createdAt: Date.now(),
    });

    return commentId;
  },
});

// Resolve a comment
export const resolveComment = mutation({
  args: { id: v.id("prComments") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Comment not found");

    await ctx.db.patch(args.id, { resolved: true });
  },
});

// Request review
export const requestReview = mutation({
  args: { id: v.id("pullRequests") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Pull request not found");

    await ctx.db.patch(args.id, {
      status: "review_requested",
      updatedAt: Date.now(),
    });
  },
});

// Approve review
export const approveReview = mutation({
  args: { id: v.id("pullRequests") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Pull request not found");

    await ctx.db.patch(args.id, {
      status: "approved",
      updatedAt: Date.now(),
    });
  },
});

// Request changes
export const requestChanges = mutation({
  args: {
    id: v.id("pullRequests"),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Pull request not found");

    await ctx.db.patch(args.id, {
      status: "changes_requested",
      updatedAt: Date.now(),
    });

    if (args.comment) {
      await ctx.db.insert("prComments", {
        pullRequestId: args.id,
        author: "reviewer",
        body: args.comment,
        resolved: false,
        createdAt: Date.now(),
      });
    }
  },
});

// Add an issue to PR (from AI code review)
export const addIssue = mutation({
  args: {
    pullRequestId: v.id("pullRequests"),
    severity: issueSeverityValidator,
    title: v.string(),
    description: v.string(),
    filePath: v.string(),
    lineNumber: v.optional(v.number()),
    suggestion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pr = await ctx.db.get(args.pullRequestId);
    if (!pr) throw new Error("Pull request not found");

    const issueId = await ctx.db.insert("prIssues", {
      pullRequestId: args.pullRequestId,
      severity: args.severity,
      title: args.title,
      description: args.description,
      filePath: args.filePath,
      lineNumber: args.lineNumber,
      suggestion: args.suggestion,
      resolved: false,
      createdAt: Date.now(),
    });

    return issueId;
  },
});

// Resolve an issue
export const resolveIssue = mutation({
  args: { id: v.id("prIssues") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Issue not found");

    await ctx.db.patch(args.id, { resolved: true });
  },
});

// Add a check to PR
export const addCheck = mutation({
  args: {
    pullRequestId: v.id("pullRequests"),
    name: v.string(),
    status: checkStatusValidator,
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pr = await ctx.db.get(args.pullRequestId);
    if (!pr) throw new Error("Pull request not found");

    const checkId = await ctx.db.insert("prChecks", {
      pullRequestId: args.pullRequestId,
      name: args.name,
      status: args.status,
      url: args.url,
      startedAt: Date.now(),
    });

    return checkId;
  },
});

// Update check status
export const updateCheck = mutation({
  args: {
    id: v.id("prChecks"),
    status: checkStatusValidator,
    output: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Check not found");

    await ctx.db.patch(args.id, {
      status: args.status,
      output: args.output,
      completedAt:
        args.status === "passed" ||
        args.status === "failed" ||
        args.status === "skipped"
          ? Date.now()
          : undefined,
    });
  },
});

// Merge PR
export const merge = mutation({
  args: { id: v.id("pullRequests") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Pull request not found");

    await ctx.db.patch(args.id, {
      status: "merged",
      updatedAt: Date.now(),
    });
  },
});

// Close PR without merging
export const close = mutation({
  args: { id: v.id("pullRequests") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Pull request not found");

    await ctx.db.patch(args.id, {
      status: "closed",
      updatedAt: Date.now(),
    });
  },
});

// Delete PR and all related data
export const deletePR = mutation({
  args: { id: v.id("pullRequests") },
  handler: async (ctx, args) => {
    const pr = await ctx.db.get(args.id);
    if (!pr) throw new Error("Pull request not found");

    // Delete comments
    const comments = await ctx.db
      .query("prComments")
      .withIndex("by_pull_request", (q) => q.eq("pullRequestId", args.id))
      .collect();
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    // Delete issues
    const issues = await ctx.db
      .query("prIssues")
      .withIndex("by_pull_request", (q) => q.eq("pullRequestId", args.id))
      .collect();
    for (const issue of issues) {
      await ctx.db.delete(issue._id);
    }

    // Delete checks
    const checks = await ctx.db
      .query("prChecks")
      .withIndex("by_pull_request", (q) => q.eq("pullRequestId", args.id))
      .collect();
    for (const check of checks) {
      await ctx.db.delete(check._id);
    }

    await ctx.db.delete(args.id);
  },
});
