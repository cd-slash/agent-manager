import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { taskPhaseValidator, phaseStatusValidator } from "./validators";

// Phase order for initialization
const PHASE_ORDER = [
  "requirements",
  "planning",
  "implementation",
  "ai_review",
  "remediation",
  "human_review",
  "merge",
] as const;

// Get all phases for a task
export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const phases = await ctx.db
      .query("taskPhases")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    return phases.sort((a, b) => a.order - b.order);
  },
});

// Get a specific phase for a task
export const getPhase = query({
  args: {
    taskId: v.id("tasks"),
    phase: taskPhaseValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", args.taskId).eq("phase", args.phase)
      )
      .first();
  },
});

// Get current phase for a task
export const getCurrentPhase = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !task.currentPhase) return null;

    const currentPhase = task.currentPhase;
    return await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", args.taskId).eq("phase", currentPhase)
      )
      .first();
  },
});

// Initialize all phases for a new task
export const initializePhases = internalMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const phaseIds = [];

    for (let i = 0; i < PHASE_ORDER.length; i++) {
      const phase = PHASE_ORDER[i]!;
      const phaseId = await ctx.db.insert("taskPhases", {
        taskId: args.taskId,
        phase,
        status: i === 0 ? "in_progress" : "pending", // First phase starts in_progress
        order: i,
      });
      phaseIds.push(phaseId);
    }

    // Update task with current phase
    await ctx.db.patch(args.taskId, {
      currentPhase: "requirements",
      phaseUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return phaseIds;
  },
});

// Start a phase (mark as in_progress)
export const startPhase = mutation({
  args: {
    taskId: v.id("tasks"),
    phase: taskPhaseValidator,
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    prompt: v.optional(v.string()),
    permissionMode: v.optional(v.string()),
    containerId: v.optional(v.string()),
    agentSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { taskId, phase, ...config } = args;

    // Get the phase record
    const phaseRecord = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", phase)
      )
      .first();

    if (!phaseRecord) {
      throw new Error(`Phase ${phase} not found for task`);
    }

    if (phaseRecord.status !== "pending") {
      throw new Error(`Phase ${phase} is not in pending status`);
    }

    const now = Date.now();

    // Update the phase record
    await ctx.db.patch(phaseRecord._id, {
      status: "in_progress",
      startedAt: now,
      ...config,
    });

    // Update task current phase
    await ctx.db.patch(taskId, {
      currentPhase: phase,
      phaseUpdatedAt: now,
      activeContainerId: config.containerId,
      updatedAt: now,
    });

    return phaseRecord._id;
  },
});

// Complete a phase
export const completePhase = mutation({
  args: {
    taskId: v.id("tasks"),
    phase: taskPhaseValidator,
    result: v.optional(v.string()),
    totalCostUsd: v.optional(v.number()),
    numTurns: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { taskId, phase, ...data } = args;

    // Get the phase record
    const phaseRecord = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", phase)
      )
      .first();

    if (!phaseRecord) {
      throw new Error(`Phase ${phase} not found for task`);
    }

    if (phaseRecord.status !== "in_progress") {
      throw new Error(`Phase ${phase} is not in progress`);
    }

    const now = Date.now();

    // Update the phase record
    await ctx.db.patch(phaseRecord._id, {
      status: "completed",
      completedAt: now,
      ...data,
    });

    // Clear active container on task
    await ctx.db.patch(taskId, {
      activeContainerId: undefined,
      phaseUpdatedAt: now,
      updatedAt: now,
    });

    return phaseRecord._id;
  },
});

// Fail a phase
export const failPhase = mutation({
  args: {
    taskId: v.id("tasks"),
    phase: taskPhaseValidator,
    error: v.string(),
    totalCostUsd: v.optional(v.number()),
    numTurns: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { taskId, phase, error, ...data } = args;

    // Get the phase record
    const phaseRecord = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", phase)
      )
      .first();

    if (!phaseRecord) {
      throw new Error(`Phase ${phase} not found for task`);
    }

    const now = Date.now();

    // Update the phase record
    await ctx.db.patch(phaseRecord._id, {
      status: "failed",
      completedAt: now,
      error,
      ...data,
    });

    // Clear active container on task (container kept for debugging)
    await ctx.db.patch(taskId, {
      phaseUpdatedAt: now,
      updatedAt: now,
    });

    return phaseRecord._id;
  },
});

// Skip a phase
export const skipPhase = mutation({
  args: {
    taskId: v.id("tasks"),
    phase: taskPhaseValidator,
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { taskId, phase, reason } = args;

    // Get the phase record
    const phaseRecord = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", phase)
      )
      .first();

    if (!phaseRecord) {
      throw new Error(`Phase ${phase} not found for task`);
    }

    if (phaseRecord.status !== "pending") {
      throw new Error(`Phase ${phase} is not in pending status`);
    }

    const now = Date.now();

    // Update the phase record
    await ctx.db.patch(phaseRecord._id, {
      status: "skipped",
      completedAt: now,
      result: reason,
    });

    // Update task phase timestamp
    await ctx.db.patch(taskId, {
      phaseUpdatedAt: now,
      updatedAt: now,
    });

    return phaseRecord._id;
  },
});

// Reset a failed phase to pending (for retry)
export const resetPhase = mutation({
  args: {
    taskId: v.id("tasks"),
    phase: taskPhaseValidator,
  },
  handler: async (ctx, args) => {
    const { taskId, phase } = args;

    // Get the phase record
    const phaseRecord = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", phase)
      )
      .first();

    if (!phaseRecord) {
      throw new Error(`Phase ${phase} not found for task`);
    }

    if (phaseRecord.status !== "failed") {
      throw new Error(`Phase ${phase} is not in failed status`);
    }

    const now = Date.now();

    // Reset the phase record
    await ctx.db.patch(phaseRecord._id, {
      status: "pending",
      startedAt: undefined,
      completedAt: undefined,
      error: undefined,
      result: undefined,
      provider: undefined,
      model: undefined,
      prompt: undefined,
      permissionMode: undefined,
      agentSessionId: undefined,
      containerId: undefined,
      totalCostUsd: undefined,
      numTurns: undefined,
      // Remediation-specific fields
      currentRemediationCycle: undefined,
      remediationTriggeredBy: undefined,
    });

    // Update task phase timestamp
    await ctx.db.patch(taskId, {
      phaseUpdatedAt: now,
      updatedAt: now,
    });

    return phaseRecord._id;
  },
});

// Update phase agent session info
export const updatePhaseSession = mutation({
  args: {
    taskId: v.id("tasks"),
    phase: taskPhaseValidator,
    agentSessionId: v.optional(v.string()),
    containerId: v.optional(v.string()),
    totalCostUsd: v.optional(v.number()),
    numTurns: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { taskId, phase, ...data } = args;

    // Get the phase record
    const phaseRecord = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", phase)
      )
      .first();

    if (!phaseRecord) {
      throw new Error(`Phase ${phase} not found for task`);
    }

    await ctx.db.patch(phaseRecord._id, data);

    // Update active container on task if provided
    if (data.containerId) {
      await ctx.db.patch(taskId, {
        activeContainerId: data.containerId,
        updatedAt: Date.now(),
      });
    }

    return phaseRecord._id;
  },
});

// Get phases by status (for monitoring)
export const listByStatus = query({
  args: { status: phaseStatusValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskPhases")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});
