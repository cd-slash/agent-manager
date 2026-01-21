import { internalMutation, internalQuery, mutation } from "../_generated/server";
import { v } from "convex/values";
import { taskPhaseValidator, remediationTriggerValidator } from "../validators";
import type { Id } from "../_generated/dataModel";

// Phase order for transitions
const PHASE_ORDER = [
  "requirements",
  "planning",
  "implementation",
  "ai_review",
  "remediation",
  "human_review",
  "merge",
] as const;

type TaskPhase = (typeof PHASE_ORDER)[number];
type RemediationTrigger = "ai_review" | "human_review";

// Valid transitions from each phase
// Note: Remediation is special - it always loops back to ai_review for validation
const VALID_TRANSITIONS: Record<TaskPhase, TaskPhase[]> = {
  requirements: ["planning"],
  planning: ["implementation"],
  implementation: ["ai_review"],
  ai_review: ["remediation", "human_review"], // remediation if changes needed, human_review if approved
  remediation: ["ai_review"], // Always loops back to AI review for validation
  human_review: ["remediation", "merge"], // remediation if changes needed, merge if approved
  merge: [], // Terminal state
};

// Triggers that can cause auto-transitions
export type TransitionTrigger =
  | "pr_created"
  | "pr_merged"
  | "agent_complete"
  | "review_approved"
  | "review_rejected"
  | "remediation_complete"
  | "remediation_requested"
  | "ai_review_approved"
  | "human_review_approved"
  | "user_advance"
  | "user_skip";

// Mapping of triggers to target phases
const TRIGGER_TARGET_PHASES: Record<TransitionTrigger, TaskPhase | null> = {
  pr_created: "ai_review",
  pr_merged: null, // Mark task as completed
  agent_complete: null, // Move to next phase
  review_approved: null, // Move to next phase
  review_rejected: "remediation", // Go to remediation
  remediation_complete: "ai_review", // Always goes back to AI review
  remediation_requested: "remediation", // Go to remediation
  ai_review_approved: "human_review", // AI approved, go to human review
  human_review_approved: "merge", // Human approved, go to merge
  user_advance: null, // Move to next phase
  user_skip: null, // Skip current phase
};

// Default max remediation cycles
const DEFAULT_MAX_REMEDIATION_CYCLES = 3;

/**
 * Get the next phase in the sequence
 */
function getNextPhase(currentPhase: TaskPhase): TaskPhase | null {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex >= PHASE_ORDER.length - 1) {
    return null;
  }
  return PHASE_ORDER[currentIndex + 1] ?? null;
}

/**
 * Check if a transition from one phase to another is valid
 */
export const validateTransition = internalQuery({
  args: {
    taskId: v.id("tasks"),
    fromPhase: taskPhaseValidator,
    toPhase: taskPhaseValidator,
  },
  handler: async (ctx, args) => {
    const { taskId, fromPhase, toPhase } = args;

    // Check task exists
    const task = await ctx.db.get(taskId);
    if (!task) {
      return { valid: false, reason: "Task not found" };
    }

    // Check current phase matches
    if (task.currentPhase !== fromPhase) {
      return {
        valid: false,
        reason: `Task is in phase ${task.currentPhase}, not ${fromPhase}`,
      };
    }

    // Check the from phase is completed
    const fromPhaseRecord = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", fromPhase)
      )
      .first();

    if (!fromPhaseRecord) {
      return { valid: false, reason: `Phase ${fromPhase} not found for task` };
    }

    if (fromPhaseRecord.status !== "completed" && fromPhaseRecord.status !== "skipped") {
      return {
        valid: false,
        reason: `Phase ${fromPhase} is ${fromPhaseRecord.status}, must be completed or skipped`,
      };
    }

    // Check valid transition
    const validTargets = VALID_TRANSITIONS[fromPhase as TaskPhase];
    if (!validTargets?.includes(toPhase as TaskPhase)) {
      return {
        valid: false,
        reason: `Cannot transition from ${fromPhase} to ${toPhase}`,
      };
    }

    // Check to phase is pending
    const toPhaseRecord = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", toPhase)
      )
      .first();

    if (!toPhaseRecord) {
      return { valid: false, reason: `Phase ${toPhase} not found for task` };
    }

    if (toPhaseRecord.status !== "pending") {
      return {
        valid: false,
        reason: `Phase ${toPhase} is ${toPhaseRecord.status}, must be pending`,
      };
    }

    return { valid: true };
  },
});

/**
 * Handle automatic phase transitions based on triggers
 */
export const autoTransition = internalMutation({
  args: {
    taskId: v.id("tasks"),
    trigger: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { taskId, trigger, metadata } = args;

    // Get task
    const task = await ctx.db.get(taskId);
    if (!task || !task.currentPhase) {
      throw new Error("Task not found or has no current phase");
    }

    const currentPhase = task.currentPhase as TaskPhase;

    // Determine target phase based on trigger
    let targetPhase: TaskPhase | null = null;
    const triggerPhase = TRIGGER_TARGET_PHASES[trigger as TransitionTrigger];

    if (triggerPhase !== undefined) {
      targetPhase = triggerPhase ?? getNextPhase(currentPhase);
    }

    // Handle special cases
    if (trigger === "pr_merged") {
      // Mark merge phase as completed and move task to done
      const mergePhase = await ctx.db
        .query("taskPhases")
        .withIndex("by_task_and_phase", (q) =>
          q.eq("taskId", taskId).eq("phase", "merge")
        )
        .first();

      if (mergePhase && mergePhase.status === "in_progress") {
        await ctx.db.patch(mergePhase._id, {
          status: "completed",
          completedAt: Date.now(),
          result: metadata?.message || "PR merged successfully",
        });
      }

      // Move task to done
      await ctx.db.patch(taskId, {
        category: "done",
        currentPhase: undefined,
        phaseUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { completed: true };
    }

    if (!targetPhase) {
      return { completed: false, reason: "No target phase determined" };
    }

    // Get current phase record
    const currentPhaseRecord = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", currentPhase)
      )
      .first();

    if (!currentPhaseRecord) {
      throw new Error(`Current phase ${currentPhase} not found`);
    }

    // Complete current phase if it's still in progress
    if (currentPhaseRecord.status === "in_progress") {
      await ctx.db.patch(currentPhaseRecord._id, {
        status: "completed",
        completedAt: Date.now(),
        result: metadata?.result,
        totalCostUsd: metadata?.totalCostUsd,
        numTurns: metadata?.numTurns,
      });
    }

    // Get target phase record
    const targetPhaseRecord = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", targetPhase)
      )
      .first();

    if (!targetPhaseRecord) {
      throw new Error(`Target phase ${targetPhase} not found`);
    }

    // If target is pending, just update task current phase
    // The phase will be started explicitly
    await ctx.db.patch(taskId, {
      currentPhase: targetPhase,
      phaseUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      completed: false,
      transitioned: true,
      from: currentPhase,
      to: targetPhase,
    };
  },
});

/**
 * Get transition info for a task
 */
export const getTransitionInfo = internalQuery({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !task.currentPhase) {
      return null;
    }

    const currentPhase = task.currentPhase as TaskPhase;
    const nextPhase = getNextPhase(currentPhase);
    const validTargets = VALID_TRANSITIONS[currentPhase];

    // Get phase records
    const phases = await ctx.db
      .query("taskPhases")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    const currentPhaseRecord = phases.find((p) => p.phase === currentPhase);

    return {
      currentPhase,
      currentPhaseStatus: currentPhaseRecord?.status,
      nextPhase,
      validTargets,
      canAdvance:
        currentPhaseRecord?.status === "completed" ||
        currentPhaseRecord?.status === "skipped",
      phases: phases.sort((a, b) => a.order - b.order),
    };
  },
});

/**
 * Manually advance to the next phase (user triggered)
 */
export const advanceToNextPhase = internalMutation({
  args: {
    taskId: v.id("tasks"),
    skipCurrent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { taskId, skipCurrent } = args;

    const task = await ctx.db.get(taskId);
    if (!task || !task.currentPhase) {
      throw new Error("Task not found or has no current phase");
    }

    const currentPhase = task.currentPhase as TaskPhase;
    const nextPhase = getNextPhase(currentPhase);

    if (!nextPhase) {
      throw new Error("No next phase available");
    }

    // Get current phase record
    const currentPhaseRecord = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", currentPhase)
      )
      .first();

    if (!currentPhaseRecord) {
      throw new Error(`Current phase ${currentPhase} not found`);
    }

    const now = Date.now();

    // Skip or complete current phase
    if (skipCurrent && currentPhaseRecord.status === "pending") {
      await ctx.db.patch(currentPhaseRecord._id, {
        status: "skipped",
        completedAt: now,
      });
    } else if (currentPhaseRecord.status === "in_progress") {
      await ctx.db.patch(currentPhaseRecord._id, {
        status: "completed",
        completedAt: now,
      });
    } else if (
      currentPhaseRecord.status !== "completed" &&
      currentPhaseRecord.status !== "skipped"
    ) {
      throw new Error(
        `Cannot advance from phase with status ${currentPhaseRecord.status}`
      );
    }

    // Update task current phase
    await ctx.db.patch(taskId, {
      currentPhase: nextPhase,
      phaseUpdatedAt: now,
      updatedAt: now,
    });

    return { from: currentPhase, to: nextPhase };
  },
});

/**
 * Link a PR to a task and trigger transition to AI review
 */
export const linkPRAndTransition = internalMutation({
  args: {
    taskId: v.id("tasks"),
    prId: v.id("pullRequests"),
  },
  handler: async (ctx, args) => {
    const { taskId, prId } = args;

    const task = await ctx.db.get(taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    // Only transition if in implementation phase
    if (task.currentPhase !== "implementation") {
      return { transitioned: false, reason: "Task is not in implementation phase" };
    }

    // Get implementation phase record
    const implPhase = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", "implementation")
      )
      .first();

    if (!implPhase) {
      throw new Error("Implementation phase not found");
    }

    const now = Date.now();

    // Complete implementation phase
    if (implPhase.status === "in_progress") {
      await ctx.db.patch(implPhase._id, {
        status: "completed",
        completedAt: now,
        result: `PR #${prId} created`,
      });
    }

    // Update task to AI review phase
    await ctx.db.patch(taskId, {
      currentPhase: "ai_review",
      activeContainerId: undefined,
      phaseUpdatedAt: now,
      updatedAt: now,
    });

    return { transitioned: true, from: "implementation", to: "ai_review" };
  },
});

// ============================================
// Remediation Flow Functions
// ============================================

/**
 * Helper to get max remediation cycles for a task
 */
async function getMaxRemediationCycles(ctx: any, taskId: Id<"tasks">): Promise<number> {
  // First check for task-specific config
  const taskConfig = await ctx.db
    .query("phaseConfigs")
    .withIndex("by_task_and_phase", (q: any) =>
      q.eq("taskId", taskId).eq("phase", "remediation")
    )
    .first();

  if (taskConfig?.maxRemediationCycles) {
    return taskConfig.maxRemediationCycles;
  }

  // Fall back to global default config
  const globalConfig = await ctx.db
    .query("phaseConfigs")
    .withIndex("by_task_and_phase", (q: any) =>
      q.eq("taskId", undefined).eq("phase", "remediation")
    )
    .first();

  return globalConfig?.maxRemediationCycles ?? DEFAULT_MAX_REMEDIATION_CYCLES;
}

/**
 * Helper to get remediation cycle count
 */
async function getRemediationCycleCount(ctx: any, taskId: Id<"tasks">): Promise<number> {
  const cycles = await ctx.db
    .query("remediationCycles")
    .withIndex("by_task", (q: any) => q.eq("taskId", taskId))
    .collect();
  return cycles.length;
}

/**
 * Trigger remediation from AI Review (auto-triggered when AI Review finds issues)
 * Called when AI review agent determines changes are needed
 */
export const triggerRemediationFromAIReview = mutation({
  args: {
    taskId: v.id("tasks"),
    issues: v.optional(v.string()), // Description of issues found
  },
  handler: async (ctx, args) => {
    const { taskId, issues } = args;

    const task = await ctx.db.get(taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    if (task.currentPhase !== "ai_review") {
      throw new Error("Task is not in AI review phase");
    }

    // Check max cycles
    const cycleCount = await getRemediationCycleCount(ctx, taskId);
    const maxCycles = await getMaxRemediationCycles(ctx, taskId);

    if (cycleCount >= maxCycles) {
      // Max cycles reached - skip to human review to decide
      const now = Date.now();

      // Complete AI review phase
      const aiReviewPhase = await ctx.db
        .query("taskPhases")
        .withIndex("by_task_and_phase", (q) =>
          q.eq("taskId", taskId).eq("phase", "ai_review")
        )
        .first();

      if (aiReviewPhase) {
        await ctx.db.patch(aiReviewPhase._id, {
          status: "completed",
          completedAt: now,
          result: `Max remediation cycles (${maxCycles}) reached. Escalating to human review.`,
        });
      }

      // Skip remediation phase
      const remediationPhase = await ctx.db
        .query("taskPhases")
        .withIndex("by_task_and_phase", (q) =>
          q.eq("taskId", taskId).eq("phase", "remediation")
        )
        .first();

      if (remediationPhase && remediationPhase.status === "pending") {
        await ctx.db.patch(remediationPhase._id, {
          status: "skipped",
          completedAt: now,
          result: "Max cycles reached",
        });
      }

      // Move to human review
      await ctx.db.patch(taskId, {
        currentPhase: "human_review",
        phaseUpdatedAt: now,
        updatedAt: now,
      });

      return {
        transitioned: true,
        maxCyclesReached: true,
        to: "human_review",
        message: `Max remediation cycles (${maxCycles}) reached. Moved to human review.`,
      };
    }

    const now = Date.now();

    // Complete AI review phase (with issues noted)
    const aiReviewPhase = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", "ai_review")
      )
      .first();

    if (aiReviewPhase && aiReviewPhase.status === "in_progress") {
      await ctx.db.patch(aiReviewPhase._id, {
        status: "completed",
        completedAt: now,
        result: issues || "Changes requested",
      });
    }

    // Update remediation phase
    const remediationPhase = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", "remediation")
      )
      .first();

    if (remediationPhase) {
      // Reset if previously completed/skipped (for loop iterations)
      await ctx.db.patch(remediationPhase._id, {
        status: "pending",
        startedAt: undefined,
        completedAt: undefined,
        result: undefined,
        error: undefined,
        currentRemediationCycle: cycleCount + 1,
        remediationTriggeredBy: "ai_review",
      });
    }

    // Update task to remediation phase
    await ctx.db.patch(taskId, {
      currentPhase: "remediation",
      activeContainerId: undefined,
      phaseUpdatedAt: now,
      updatedAt: now,
    });

    return {
      transitioned: true,
      maxCyclesReached: false,
      from: "ai_review",
      to: "remediation",
      cycleNumber: cycleCount + 1,
    };
  },
});

/**
 * Trigger remediation from Human Review (user-initiated when they request changes)
 */
export const triggerRemediationFromHumanReview = mutation({
  args: {
    taskId: v.id("tasks"),
    feedback: v.string(), // Human's description of what changes are needed
  },
  handler: async (ctx, args) => {
    const { taskId, feedback } = args;

    const task = await ctx.db.get(taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    if (task.currentPhase !== "human_review") {
      throw new Error("Task is not in human review phase");
    }

    // Check max cycles
    const cycleCount = await getRemediationCycleCount(ctx, taskId);
    const maxCycles = await getMaxRemediationCycles(ctx, taskId);

    if (cycleCount >= maxCycles) {
      return {
        transitioned: false,
        maxCyclesReached: true,
        message: `Max remediation cycles (${maxCycles}) reached. Please approve or reject the PR manually.`,
      };
    }

    const now = Date.now();

    // Mark human review as needing remediation (but don't complete it yet - it will be revisited)
    const humanReviewPhase = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", "human_review")
      )
      .first();

    if (humanReviewPhase) {
      await ctx.db.patch(humanReviewPhase._id, {
        result: `Changes requested: ${feedback}`,
      });
    }

    // Update remediation phase
    const remediationPhase = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", "remediation")
      )
      .first();

    if (remediationPhase) {
      // Reset if previously completed/skipped (for loop iterations)
      await ctx.db.patch(remediationPhase._id, {
        status: "pending",
        startedAt: undefined,
        completedAt: undefined,
        result: undefined,
        error: undefined,
        currentRemediationCycle: cycleCount + 1,
        remediationTriggeredBy: "human_review",
      });
    }

    // Update task to remediation phase
    await ctx.db.patch(taskId, {
      currentPhase: "remediation",
      activeContainerId: undefined,
      phaseUpdatedAt: now,
      updatedAt: now,
    });

    // Create the remediation cycle record with feedback
    await ctx.db.insert("remediationCycles", {
      taskId,
      cycleNumber: cycleCount + 1,
      triggeredBy: "human_review",
      feedback,
      status: "pending",
      createdAt: now,
    });

    return {
      transitioned: true,
      maxCyclesReached: false,
      from: "human_review",
      to: "remediation",
      cycleNumber: cycleCount + 1,
    };
  },
});

/**
 * Complete remediation and transition back to AI Review for validation
 * Called when remediation agent completes its work
 */
export const completeRemediationCycle = mutation({
  args: {
    taskId: v.id("tasks"),
    result: v.optional(v.string()),
    totalCostUsd: v.optional(v.number()),
    numTurns: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { taskId, result, totalCostUsd, numTurns } = args;

    const task = await ctx.db.get(taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    if (task.currentPhase !== "remediation") {
      throw new Error("Task is not in remediation phase");
    }

    const now = Date.now();

    // Get the remediation phase to find current cycle
    const remediationPhase = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", "remediation")
      )
      .first();

    if (!remediationPhase) {
      throw new Error("Remediation phase not found");
    }

    const cycleNumber = remediationPhase.currentRemediationCycle || 1;

    // Update the cycle record if it exists
    const cycle = await ctx.db
      .query("remediationCycles")
      .withIndex("by_task_and_cycle", (q) =>
        q.eq("taskId", taskId).eq("cycleNumber", cycleNumber)
      )
      .first();

    if (cycle) {
      await ctx.db.patch(cycle._id, {
        status: "completed",
        completedAt: now,
        result,
        totalCostUsd,
        numTurns,
      });
    }

    // Complete remediation phase
    await ctx.db.patch(remediationPhase._id, {
      status: "completed",
      completedAt: now,
      result,
      totalCostUsd,
      numTurns,
    });

    // Reset AI review phase to pending so it can re-validate
    const aiReviewPhase = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", "ai_review")
      )
      .first();

    if (aiReviewPhase) {
      await ctx.db.patch(aiReviewPhase._id, {
        status: "pending",
        startedAt: undefined,
        completedAt: undefined,
        result: undefined,
        error: undefined,
      });
    }

    // Transition to AI review for validation
    await ctx.db.patch(taskId, {
      currentPhase: "ai_review",
      activeContainerId: undefined,
      phaseUpdatedAt: now,
      updatedAt: now,
    });

    return {
      transitioned: true,
      from: "remediation",
      to: "ai_review",
      cycleNumber,
      message: "Remediation complete. Transitioning to AI Review for validation.",
    };
  },
});

/**
 * Approve AI Review and transition to Human Review
 * Called when AI review determines no changes are needed
 */
export const approveAIReview = mutation({
  args: {
    taskId: v.id("tasks"),
    result: v.optional(v.string()),
    totalCostUsd: v.optional(v.number()),
    numTurns: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { taskId, result, totalCostUsd, numTurns } = args;

    const task = await ctx.db.get(taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    if (task.currentPhase !== "ai_review") {
      throw new Error("Task is not in AI review phase");
    }

    const now = Date.now();

    // Complete AI review phase
    const aiReviewPhase = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", "ai_review")
      )
      .first();

    if (aiReviewPhase) {
      await ctx.db.patch(aiReviewPhase._id, {
        status: "completed",
        completedAt: now,
        result: result || "Approved",
        totalCostUsd,
        numTurns,
      });
    }

    // Check if remediation was previously used - if so, skip it
    const remediationPhase = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", "remediation")
      )
      .first();

    if (remediationPhase && remediationPhase.status === "pending") {
      await ctx.db.patch(remediationPhase._id, {
        status: "skipped",
        completedAt: now,
        result: "No remediation needed - AI review approved",
      });
    }

    // Transition to human review
    await ctx.db.patch(taskId, {
      currentPhase: "human_review",
      activeContainerId: undefined,
      phaseUpdatedAt: now,
      updatedAt: now,
    });

    return {
      transitioned: true,
      from: "ai_review",
      to: "human_review",
    };
  },
});

/**
 * Approve Human Review and transition to Merge
 * Called when human reviewer approves the changes
 */
export const approveHumanReview = mutation({
  args: {
    taskId: v.id("tasks"),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { taskId, comment } = args;

    const task = await ctx.db.get(taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    if (task.currentPhase !== "human_review") {
      throw new Error("Task is not in human review phase");
    }

    const now = Date.now();

    // Complete human review phase
    const humanReviewPhase = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", "human_review")
      )
      .first();

    if (humanReviewPhase) {
      await ctx.db.patch(humanReviewPhase._id, {
        status: "completed",
        completedAt: now,
        result: comment || "Approved by human reviewer",
      });
    }

    // Transition to merge
    await ctx.db.patch(taskId, {
      currentPhase: "merge",
      phaseUpdatedAt: now,
      updatedAt: now,
    });

    return {
      transitioned: true,
      from: "human_review",
      to: "merge",
    };
  },
});

/**
 * Get remediation status for a task
 */
export const getRemediationStatus = internalQuery({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const { taskId } = args;

    const cycles = await ctx.db
      .query("remediationCycles")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();

    const maxCycles = await getMaxRemediationCycles(ctx, taskId);

    const remediationPhase = await ctx.db
      .query("taskPhases")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", "remediation")
      )
      .first();

    return {
      totalCycles: cycles.length,
      maxCycles,
      cyclesRemaining: Math.max(0, maxCycles - cycles.length),
      isMaxReached: cycles.length >= maxCycles,
      currentCycle: remediationPhase?.currentRemediationCycle || 0,
      triggeredBy: remediationPhase?.remediationTriggeredBy || null,
      cycles: cycles.sort((a, b) => a.cycleNumber - b.cycleNumber),
    };
  },
});
