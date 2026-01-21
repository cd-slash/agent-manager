import { v } from "convex/values"
import type { Id } from "../_generated/dataModel"
import { internalMutation, internalQuery, mutation } from "../_generated/server"
import { DEFAULT_PHASE_ORDER } from "../taskTemplates"
import { taskPhaseValidator } from "../validators"

type TaskPhase =
	| "requirements"
	| "planning"
	| "implementation"
	| "ai_review"
	| "remediation"
	| "human_review"
	| "merge"
type RemediationTrigger = "ai_review" | "human_review"

/**
 * Get valid transitions for a task based on its template
 */
async function getValidTransitionsForTask(
	// biome-ignore lint/suspicious/noExplicitAny: Convex mutation context type
	ctx: any,
	taskId: Id<"tasks">,
): Promise<Record<TaskPhase, TaskPhase[]>> {
	const task = await ctx.db.get(taskId)
	if (!task) {
		throw new Error("Task not found")
	}

	// Get phases from template
	let phases: TaskPhase[]
	if (task.templateId) {
		const template = await ctx.db.get(task.templateId)
		if (template) {
			phases = template.phases as TaskPhase[]
		} else {
			phases = DEFAULT_PHASE_ORDER
		}
	} else {
		// Try to get phases from taskPhases table (for existing tasks)
		const taskPhases = await ctx.db
			.query("taskPhases")
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic index query builder
			.withIndex("by_task", (q: any) => q.eq("taskId", taskId))
			.collect()

		if (taskPhases.length > 0) {
			phases = taskPhases
				// biome-ignore lint/suspicious/noExplicitAny: Generic sort callback
				.sort((a: any, b: any) => a.order - b.order)
				// biome-ignore lint/suspicious/noExplicitAny: Generic map callback
				.map((p: any) => p.phase) as TaskPhase[]
		} else {
			phases = DEFAULT_PHASE_ORDER
		}
	}

	return deriveTransitionsFromPhases(phases)
}

/**
 * Derive valid transitions from a phase list
 */
function deriveTransitionsFromPhases(
	phases: TaskPhase[],
): Record<TaskPhase, TaskPhase[]> {
	const transitions: Record<string, TaskPhase[]> = {}
	const hasRemediation = phases.includes("remediation")
	const hasAIReview = phases.includes("ai_review")

	for (let i = 0; i < phases.length; i++) {
		const phase = phases[i]
		if (!phase) continue
		const nextPhase = phases[i + 1] as TaskPhase | undefined

		if (phase === "ai_review") {
			// AI Review can go to remediation (if present) or skip to next non-remediation phase
			const targets: TaskPhase[] = []
			if (hasRemediation) {
				targets.push("remediation")
			}
			// Find the next phase after ai_review (skipping remediation since that's a branch)
			for (let j = i + 1; j < phases.length; j++) {
				if (phases[j] !== "remediation") {
					targets.push(phases[j] as TaskPhase)
					break
				}
			}
			transitions[phase] = targets
		} else if (phase === "remediation") {
			// Remediation always goes back to ai_review for validation (if ai_review exists)
			// Otherwise goes to the next phase
			if (hasAIReview) {
				transitions[phase] = ["ai_review"]
			} else if (nextPhase) {
				transitions[phase] = [nextPhase]
			} else {
				transitions[phase] = []
			}
		} else if (phase === "human_review") {
			// Human review can go to remediation (if present) or next phase
			const targets: TaskPhase[] = []
			if (hasRemediation) {
				targets.push("remediation")
			}
			if (nextPhase) {
				targets.push(nextPhase)
			}
			transitions[phase] = targets
		} else {
			// Normal phase - just goes to next
			transitions[phase] = nextPhase ? [nextPhase] : []
		}
	}

	return transitions as Record<TaskPhase, TaskPhase[]>
}

/**
 * Get phases for a task
 */
async function getPhasesForTask(
	// biome-ignore lint/suspicious/noExplicitAny: Convex mutation context type
	ctx: any,
	taskId: Id<"tasks">,
): Promise<TaskPhase[]> {
	const task = await ctx.db.get(taskId)
	if (!task) {
		return DEFAULT_PHASE_ORDER
	}

	if (task.templateId) {
		const template = await ctx.db.get(task.templateId)
		if (template) {
			return template.phases as TaskPhase[]
		}
	}

	// Fall back to task's actual phases
	const taskPhases = await ctx.db
		.query("taskPhases")
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic index query builder
		.withIndex("by_task", (q: any) => q.eq("taskId", taskId))
		.collect()

	if (taskPhases.length > 0) {
		return taskPhases
			// biome-ignore lint/suspicious/noExplicitAny: Generic sort callback
			.sort((a: any, b: any) => a.order - b.order)
			// biome-ignore lint/suspicious/noExplicitAny: Generic map callback
			.map((p: any) => p.phase) as TaskPhase[]
	}

	return DEFAULT_PHASE_ORDER
}

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
	| "user_skip"

// Default max remediation cycles
const DEFAULT_MAX_REMEDIATION_CYCLES = 3

/**
 * Get the next phase in the sequence for a task
 */
async function getNextPhaseForTask(
	// biome-ignore lint/suspicious/noExplicitAny: Convex mutation context type
	ctx: any,
	taskId: Id<"tasks">,
	currentPhase: TaskPhase,
): Promise<TaskPhase | null> {
	const phases = await getPhasesForTask(ctx, taskId)
	const currentIndex = phases.indexOf(currentPhase)
	if (currentIndex === -1 || currentIndex >= phases.length - 1) {
		return null
	}
	return phases[currentIndex + 1] ?? null
}

/**
 * Get target phase for a trigger based on task's template
 */
async function getTriggerTargetPhase(
	// biome-ignore lint/suspicious/noExplicitAny: Convex mutation context type
	ctx: any,
	taskId: Id<"tasks">,
	trigger: TransitionTrigger,
	currentPhase: TaskPhase,
): Promise<TaskPhase | null> {
	const phases = await getPhasesForTask(ctx, taskId)
	const hasRemediation = phases.includes("remediation")
	const hasAIReview = phases.includes("ai_review")
	const hasHumanReview = phases.includes("human_review")

	switch (trigger) {
		case "pr_created":
			// After PR created, go to ai_review if present, otherwise next phase
			if (hasAIReview) return "ai_review"
			return getNextPhaseForTask(ctx, taskId, currentPhase)

		case "pr_merged":
			return null // Mark task as completed

		case "review_rejected":
		case "remediation_requested":
			// Go to remediation if present, otherwise stay
			return hasRemediation ? "remediation" : null

		case "remediation_complete":
			// After remediation, go to ai_review for validation if present
			return hasAIReview
				? "ai_review"
				: getNextPhaseForTask(ctx, taskId, "remediation")

		case "ai_review_approved":
			// After AI approval, go to human_review if present, otherwise next phase
			if (hasHumanReview) return "human_review"
			return getNextPhaseForTask(ctx, taskId, "ai_review")

		case "human_review_approved":
			// After human approval, go to merge if present, otherwise next phase
			if (phases.includes("merge")) return "merge"
			return getNextPhaseForTask(ctx, taskId, "human_review")

		case "agent_complete":
		case "review_approved":
		case "user_advance":
		case "user_skip":
			// Move to next phase
			return getNextPhaseForTask(ctx, taskId, currentPhase)

		default:
			return null
	}
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
		const { taskId, fromPhase, toPhase } = args

		// Check task exists
		const task = await ctx.db.get(taskId)
		if (!task) {
			return { valid: false, reason: "Task not found" }
		}

		// Check current phase matches
		if (task.currentPhase !== fromPhase) {
			return {
				valid: false,
				reason: `Task is in phase ${task.currentPhase}, not ${fromPhase}`,
			}
		}

		// Check the from phase is completed
		const fromPhaseRecord = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", fromPhase),
			)
			.first()

		if (!fromPhaseRecord) {
			return { valid: false, reason: `Phase ${fromPhase} not found for task` }
		}

		if (
			fromPhaseRecord.status !== "completed" &&
			fromPhaseRecord.status !== "skipped"
		) {
			return {
				valid: false,
				reason: `Phase ${fromPhase} is ${fromPhaseRecord.status}, must be completed or skipped`,
			}
		}

		// Get valid transitions for this task based on its template
		const validTransitions = await getValidTransitionsForTask(ctx, taskId)
		const validTargets = validTransitions[fromPhase as TaskPhase] || []

		if (!validTargets.includes(toPhase as TaskPhase)) {
			return {
				valid: false,
				reason: `Cannot transition from ${fromPhase} to ${toPhase}`,
			}
		}

		// Check to phase exists in the task's phases
		const toPhaseRecord = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", toPhase),
			)
			.first()

		if (!toPhaseRecord) {
			return { valid: false, reason: `Phase ${toPhase} not found for task` }
		}

		if (toPhaseRecord.status !== "pending") {
			return {
				valid: false,
				reason: `Phase ${toPhase} is ${toPhaseRecord.status}, must be pending`,
			}
		}

		return { valid: true }
	},
})

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
		const { taskId, trigger, metadata } = args

		// Get task
		const task = await ctx.db.get(taskId)
		if (!task || !task.currentPhase) {
			throw new Error("Task not found or has no current phase")
		}

		const currentPhase = task.currentPhase as TaskPhase

		// Determine target phase based on trigger and task's template
		const targetPhase = await getTriggerTargetPhase(
			ctx,
			taskId,
			trigger as TransitionTrigger,
			currentPhase,
		)

		// Handle special cases
		if (trigger === "pr_merged") {
			// Mark merge phase as completed and move task to done
			const mergePhase = await ctx.db
				.query("taskPhases")
				.withIndex("by_task_and_phase", (q) =>
					q.eq("taskId", taskId).eq("phase", "merge"),
				)
				.first()

			if (mergePhase && mergePhase.status === "in_progress") {
				await ctx.db.patch(mergePhase._id, {
					status: "completed",
					completedAt: Date.now(),
					result: metadata?.message || "PR merged successfully",
				})
			}

			// Move task to done
			await ctx.db.patch(taskId, {
				category: "done",
				currentPhase: undefined,
				phaseUpdatedAt: Date.now(),
				updatedAt: Date.now(),
			})

			return { completed: true }
		}

		if (!targetPhase) {
			return { completed: false, reason: "No target phase determined" }
		}

		// Get current phase record
		const currentPhaseRecord = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", currentPhase),
			)
			.first()

		if (!currentPhaseRecord) {
			throw new Error(`Current phase ${currentPhase} not found`)
		}

		// Complete current phase if it's still in progress
		if (currentPhaseRecord.status === "in_progress") {
			await ctx.db.patch(currentPhaseRecord._id, {
				status: "completed",
				completedAt: Date.now(),
				result: metadata?.result,
				totalCostUsd: metadata?.totalCostUsd,
				numTurns: metadata?.numTurns,
			})
		}

		// Get target phase record
		const targetPhaseRecord = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", targetPhase),
			)
			.first()

		if (!targetPhaseRecord) {
			throw new Error(`Target phase ${targetPhase} not found`)
		}

		// If target is pending, just update task current phase
		// The phase will be started explicitly
		await ctx.db.patch(taskId, {
			currentPhase: targetPhase,
			phaseUpdatedAt: Date.now(),
			updatedAt: Date.now(),
		})

		return {
			completed: false,
			transitioned: true,
			from: currentPhase,
			to: targetPhase,
		}
	},
})

/**
 * Get transition info for a task
 */
export const getTransitionInfo = internalQuery({
	args: { taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId)
		if (!task || !task.currentPhase) {
			return null
		}

		const currentPhase = task.currentPhase as TaskPhase
		const nextPhase = await getNextPhaseForTask(ctx, args.taskId, currentPhase)
		const validTransitions = await getValidTransitionsForTask(ctx, args.taskId)
		const validTargets = validTransitions[currentPhase] || []

		// Get phase records
		const phases = await ctx.db
			.query("taskPhases")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect()

		const currentPhaseRecord = phases.find((p) => p.phase === currentPhase)

		// Get template info
		let templateName: string | undefined
		if (task.templateId) {
			const template = await ctx.db.get(task.templateId)
			templateName = template?.name
		}

		return {
			currentPhase,
			currentPhaseStatus: currentPhaseRecord?.status,
			nextPhase,
			validTargets,
			canAdvance:
				currentPhaseRecord?.status === "completed" ||
				currentPhaseRecord?.status === "skipped",
			phases: phases.sort((a, b) => a.order - b.order),
			templateName,
		}
	},
})

/**
 * Manually advance to the next phase (user triggered)
 */
export const advanceToNextPhase = internalMutation({
	args: {
		taskId: v.id("tasks"),
		skipCurrent: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { taskId, skipCurrent } = args

		const task = await ctx.db.get(taskId)
		if (!task || !task.currentPhase) {
			throw new Error("Task not found or has no current phase")
		}

		const currentPhase = task.currentPhase as TaskPhase
		const nextPhase = await getNextPhaseForTask(ctx, taskId, currentPhase)

		if (!nextPhase) {
			throw new Error("No next phase available")
		}

		// Get current phase record
		const currentPhaseRecord = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", currentPhase),
			)
			.first()

		if (!currentPhaseRecord) {
			throw new Error(`Current phase ${currentPhase} not found`)
		}

		const now = Date.now()

		// Skip or complete current phase
		if (skipCurrent && currentPhaseRecord.status === "pending") {
			await ctx.db.patch(currentPhaseRecord._id, {
				status: "skipped",
				completedAt: now,
			})
		} else if (currentPhaseRecord.status === "in_progress") {
			await ctx.db.patch(currentPhaseRecord._id, {
				status: "completed",
				completedAt: now,
			})
		} else if (
			currentPhaseRecord.status !== "completed" &&
			currentPhaseRecord.status !== "skipped"
		) {
			throw new Error(
				`Cannot advance from phase with status ${currentPhaseRecord.status}`,
			)
		}

		// Update task current phase
		await ctx.db.patch(taskId, {
			currentPhase: nextPhase,
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		return { from: currentPhase, to: nextPhase }
	},
})

/**
 * Link a PR to a task and trigger transition to AI review
 */
export const linkPRAndTransition = internalMutation({
	args: {
		taskId: v.id("tasks"),
		prId: v.id("pullRequests"),
	},
	handler: async (ctx, args) => {
		const { taskId, prId } = args

		const task = await ctx.db.get(taskId)
		if (!task) {
			throw new Error("Task not found")
		}

		// Only transition if in implementation phase
		if (task.currentPhase !== "implementation") {
			return {
				transitioned: false,
				reason: "Task is not in implementation phase",
			}
		}

		// Get implementation phase record
		const implPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "implementation"),
			)
			.first()

		if (!implPhase) {
			throw new Error("Implementation phase not found")
		}

		const now = Date.now()

		// Complete implementation phase
		if (implPhase.status === "in_progress") {
			await ctx.db.patch(implPhase._id, {
				status: "completed",
				completedAt: now,
				result: `PR #${prId} created`,
			})
		}

		// Update task to AI review phase
		await ctx.db.patch(taskId, {
			currentPhase: "ai_review",
			activeContainerId: undefined,
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		return { transitioned: true, from: "implementation", to: "ai_review" }
	},
})

// ============================================
// Remediation Flow Functions
// ============================================

/**
 * Helper to get max remediation cycles for a task
 */
async function getMaxRemediationCycles(
	// biome-ignore lint/suspicious/noExplicitAny: Convex mutation context type
	ctx: any,
	taskId: Id<"tasks">,
): Promise<number> {
	// First check for task-specific config
	const taskConfig = await ctx.db
		.query("phaseConfigs")
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic index query builder
		.withIndex("by_task_and_phase", (q: any) =>
			q.eq("taskId", taskId).eq("phase", "remediation"),
		)
		.first()

	if (taskConfig?.maxRemediationCycles) {
		return taskConfig.maxRemediationCycles
	}

	// Fall back to global default config
	const globalConfig = await ctx.db
		.query("phaseConfigs")
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic index query builder
		.withIndex("by_task_and_phase", (q: any) =>
			q.eq("taskId", undefined).eq("phase", "remediation"),
		)
		.first()

	return globalConfig?.maxRemediationCycles ?? DEFAULT_MAX_REMEDIATION_CYCLES
}

/**
 * Helper to get remediation cycle count
 */
async function getRemediationCycleCount(
	// biome-ignore lint/suspicious/noExplicitAny: Convex mutation context type
	ctx: any,
	taskId: Id<"tasks">,
): Promise<number> {
	const cycles = await ctx.db
		.query("remediationCycles")
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic index query builder
		.withIndex("by_task", (q: any) => q.eq("taskId", taskId))
		.collect()
	return cycles.length
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
		const { taskId, issues } = args

		const task = await ctx.db.get(taskId)
		if (!task) {
			throw new Error("Task not found")
		}

		if (task.currentPhase !== "ai_review") {
			throw new Error("Task is not in AI review phase")
		}

		// Check max cycles
		const cycleCount = await getRemediationCycleCount(ctx, taskId)
		const maxCycles = await getMaxRemediationCycles(ctx, taskId)

		if (cycleCount >= maxCycles) {
			// Max cycles reached - skip to human review to decide
			const now = Date.now()

			// Complete AI review phase
			const aiReviewPhase = await ctx.db
				.query("taskPhases")
				.withIndex("by_task_and_phase", (q) =>
					q.eq("taskId", taskId).eq("phase", "ai_review"),
				)
				.first()

			if (aiReviewPhase) {
				await ctx.db.patch(aiReviewPhase._id, {
					status: "completed",
					completedAt: now,
					result: `Max remediation cycles (${maxCycles}) reached. Escalating to human review.`,
				})
			}

			// Skip remediation phase
			const remediationPhase = await ctx.db
				.query("taskPhases")
				.withIndex("by_task_and_phase", (q) =>
					q.eq("taskId", taskId).eq("phase", "remediation"),
				)
				.first()

			if (remediationPhase && remediationPhase.status === "pending") {
				await ctx.db.patch(remediationPhase._id, {
					status: "skipped",
					completedAt: now,
					result: "Max cycles reached",
				})
			}

			// Move to human review
			await ctx.db.patch(taskId, {
				currentPhase: "human_review",
				phaseUpdatedAt: now,
				updatedAt: now,
			})

			return {
				transitioned: true,
				maxCyclesReached: true,
				to: "human_review",
				message: `Max remediation cycles (${maxCycles}) reached. Moved to human review.`,
			}
		}

		const now = Date.now()

		// Complete AI review phase (with issues noted)
		const aiReviewPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "ai_review"),
			)
			.first()

		if (aiReviewPhase && aiReviewPhase.status === "in_progress") {
			await ctx.db.patch(aiReviewPhase._id, {
				status: "completed",
				completedAt: now,
				result: issues || "Changes requested",
			})
		}

		// Update remediation phase
		const remediationPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "remediation"),
			)
			.first()

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
			})
		}

		// Update task to remediation phase
		await ctx.db.patch(taskId, {
			currentPhase: "remediation",
			activeContainerId: undefined,
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		return {
			transitioned: true,
			maxCyclesReached: false,
			from: "ai_review",
			to: "remediation",
			cycleNumber: cycleCount + 1,
		}
	},
})

/**
 * Trigger remediation from Human Review (user-initiated when they request changes)
 */
export const triggerRemediationFromHumanReview = mutation({
	args: {
		taskId: v.id("tasks"),
		feedback: v.string(), // Human's description of what changes are needed
	},
	handler: async (ctx, args) => {
		const { taskId, feedback } = args

		const task = await ctx.db.get(taskId)
		if (!task) {
			throw new Error("Task not found")
		}

		if (task.currentPhase !== "human_review") {
			throw new Error("Task is not in human review phase")
		}

		// Check max cycles
		const cycleCount = await getRemediationCycleCount(ctx, taskId)
		const maxCycles = await getMaxRemediationCycles(ctx, taskId)

		if (cycleCount >= maxCycles) {
			return {
				transitioned: false,
				maxCyclesReached: true,
				message: `Max remediation cycles (${maxCycles}) reached. Please approve or reject the PR manually.`,
			}
		}

		const now = Date.now()

		// Mark human review as needing remediation (but don't complete it yet - it will be revisited)
		const humanReviewPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "human_review"),
			)
			.first()

		if (humanReviewPhase) {
			await ctx.db.patch(humanReviewPhase._id, {
				result: `Changes requested: ${feedback}`,
			})
		}

		// Update remediation phase
		const remediationPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "remediation"),
			)
			.first()

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
			})
		}

		// Update task to remediation phase
		await ctx.db.patch(taskId, {
			currentPhase: "remediation",
			activeContainerId: undefined,
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		// Create the remediation cycle record with feedback
		await ctx.db.insert("remediationCycles", {
			taskId,
			cycleNumber: cycleCount + 1,
			triggeredBy: "human_review",
			feedback,
			status: "pending",
			createdAt: now,
		})

		return {
			transitioned: true,
			maxCyclesReached: false,
			from: "human_review",
			to: "remediation",
			cycleNumber: cycleCount + 1,
		}
	},
})

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
		const { taskId, result, totalCostUsd, numTurns } = args

		const task = await ctx.db.get(taskId)
		if (!task) {
			throw new Error("Task not found")
		}

		if (task.currentPhase !== "remediation") {
			throw new Error("Task is not in remediation phase")
		}

		const now = Date.now()

		// Get the remediation phase to find current cycle
		const remediationPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "remediation"),
			)
			.first()

		if (!remediationPhase) {
			throw new Error("Remediation phase not found")
		}

		const cycleNumber = remediationPhase.currentRemediationCycle || 1

		// Update the cycle record if it exists
		const cycle = await ctx.db
			.query("remediationCycles")
			.withIndex("by_task_and_cycle", (q) =>
				q.eq("taskId", taskId).eq("cycleNumber", cycleNumber),
			)
			.first()

		if (cycle) {
			await ctx.db.patch(cycle._id, {
				status: "completed",
				completedAt: now,
				result,
				totalCostUsd,
				numTurns,
			})
		}

		// Complete remediation phase
		await ctx.db.patch(remediationPhase._id, {
			status: "completed",
			completedAt: now,
			result,
			totalCostUsd,
			numTurns,
		})

		// Reset AI review phase to pending so it can re-validate
		const aiReviewPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "ai_review"),
			)
			.first()

		if (aiReviewPhase) {
			await ctx.db.patch(aiReviewPhase._id, {
				status: "pending",
				startedAt: undefined,
				completedAt: undefined,
				result: undefined,
				error: undefined,
			})
		}

		// Transition to AI review for validation
		await ctx.db.patch(taskId, {
			currentPhase: "ai_review",
			activeContainerId: undefined,
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		return {
			transitioned: true,
			from: "remediation",
			to: "ai_review",
			cycleNumber,
			message:
				"Remediation complete. Transitioning to AI Review for validation.",
		}
	},
})

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
		const { taskId, result, totalCostUsd, numTurns } = args

		const task = await ctx.db.get(taskId)
		if (!task) {
			throw new Error("Task not found")
		}

		if (task.currentPhase !== "ai_review") {
			throw new Error("Task is not in AI review phase")
		}

		const now = Date.now()

		// Complete AI review phase
		const aiReviewPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "ai_review"),
			)
			.first()

		if (aiReviewPhase) {
			await ctx.db.patch(aiReviewPhase._id, {
				status: "completed",
				completedAt: now,
				result: result || "Approved",
				totalCostUsd,
				numTurns,
			})
		}

		// Check if remediation was previously used - if so, skip it
		const remediationPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "remediation"),
			)
			.first()

		if (remediationPhase && remediationPhase.status === "pending") {
			await ctx.db.patch(remediationPhase._id, {
				status: "skipped",
				completedAt: now,
				result: "No remediation needed - AI review approved",
			})
		}

		// Transition to human review
		await ctx.db.patch(taskId, {
			currentPhase: "human_review",
			activeContainerId: undefined,
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		return {
			transitioned: true,
			from: "ai_review",
			to: "human_review",
		}
	},
})

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
		const { taskId, comment } = args

		const task = await ctx.db.get(taskId)
		if (!task) {
			throw new Error("Task not found")
		}

		if (task.currentPhase !== "human_review") {
			throw new Error("Task is not in human review phase")
		}

		const now = Date.now()

		// Complete human review phase
		const humanReviewPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "human_review"),
			)
			.first()

		if (humanReviewPhase) {
			await ctx.db.patch(humanReviewPhase._id, {
				status: "completed",
				completedAt: now,
				result: comment || "Approved by human reviewer",
			})
		}

		// Transition to merge
		await ctx.db.patch(taskId, {
			currentPhase: "merge",
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		return {
			transitioned: true,
			from: "human_review",
			to: "merge",
		}
	},
})

/**
 * Get remediation status for a task
 */
export const getRemediationStatus = internalQuery({
	args: { taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const { taskId } = args

		const cycles = await ctx.db
			.query("remediationCycles")
			.withIndex("by_task", (q) => q.eq("taskId", taskId))
			.collect()

		const maxCycles = await getMaxRemediationCycles(ctx, taskId)

		const remediationPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "remediation"),
			)
			.first()

		return {
			totalCycles: cycles.length,
			maxCycles,
			cyclesRemaining: Math.max(0, maxCycles - cycles.length),
			isMaxReached: cycles.length >= maxCycles,
			currentCycle: remediationPhase?.currentRemediationCycle || 0,
			triggeredBy: remediationPhase?.remediationTriggeredBy || null,
			cycles: cycles.sort((a, b) => a.cycleNumber - b.cycleNumber),
		}
	},
})
