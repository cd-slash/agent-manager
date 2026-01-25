import { v } from "convex/values"
import { internalMutation, mutation, query } from "./_generated/server"
import { DEFAULT_PHASE_ORDER } from "./taskTemplates"
import { phaseStatusValidator, taskPhaseValidator } from "./validators"

// Type for task phases
type TaskPhase =
	| "requirements"
	| "planning"
	| "implementation"
	| "ai_review"
	| "remediation"
	| "human_review"
	| "merge"

// Get all phases for a task
export const listByTask = query({
	args: { taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const phases = await ctx.db
			.query("taskPhases")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect()
		return phases.sort((a, b) => a.order - b.order)
	},
})

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
				q.eq("taskId", args.taskId).eq("phase", args.phase),
			)
			.first()
	},
})

// Get current phase for a task
export const getCurrentPhase = query({
	args: { taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId)
		if (!task || !task.currentPhase) return null

		const currentPhase = task.currentPhase
		return await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", args.taskId).eq("phase", currentPhase),
			)
			.first()
	},
})

// Initialize phases for a new task based on template
export const initializePhases = internalMutation({
	args: {
		taskId: v.id("tasks"),
		templateId: v.optional(v.id("taskTemplates")),
	},
	handler: async (ctx, args) => {
		// Get phases from template or use default
		let phases: TaskPhase[]

		if (args.templateId) {
			const template = await ctx.db.get(args.templateId)
			if (template) {
				phases = template.phases as TaskPhase[]
			} else {
				// Template not found, use default
				const defaultTemplate = await ctx.db
					.query("taskTemplates")
					.withIndex("by_default", (q) => q.eq("isDefault", true))
					.first()
				phases = (defaultTemplate?.phases as TaskPhase[]) ?? DEFAULT_PHASE_ORDER
			}
		} else {
			// No template specified, use default
			const defaultTemplate = await ctx.db
				.query("taskTemplates")
				.withIndex("by_default", (q) => q.eq("isDefault", true))
				.first()
			phases = (defaultTemplate?.phases as TaskPhase[]) ?? DEFAULT_PHASE_ORDER
		}

		const phaseIds = []
		const firstPhase = phases[0]

		for (let i = 0; i < phases.length; i++) {
			const phase = phases[i]
			if (!phase) continue
			const phaseId = await ctx.db.insert("taskPhases", {
				taskId: args.taskId,
				phase,
				status: i === 0 ? "in_progress" : "pending", // First phase starts in_progress
				order: i,
			})
			phaseIds.push(phaseId)
		}

		// Update task with current phase and template
		await ctx.db.patch(args.taskId, {
			currentPhase: firstPhase,
			templateId: args.templateId,
			phaseUpdatedAt: Date.now(),
			updatedAt: Date.now(),
		})

		return { phaseIds, phases }
	},
})

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
		const { taskId, phase, ...config } = args

		// Get the phase record
		const phaseRecord = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", phase),
			)
			.first()

		if (!phaseRecord) {
			throw new Error(`Phase ${phase} not found for task`)
		}

		if (phaseRecord.status !== "pending") {
			throw new Error(`Phase ${phase} is not in pending status`)
		}

		const now = Date.now()

		// Update the phase record
		await ctx.db.patch(phaseRecord._id, {
			status: "in_progress",
			startedAt: now,
			...config,
		})

		// Update task current phase
		await ctx.db.patch(taskId, {
			currentPhase: phase,
			phaseUpdatedAt: now,
			activeContainerId: config.containerId,
			updatedAt: now,
		})

		return phaseRecord._id
	},
})

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
		const { taskId, phase, ...data } = args

		// Get the phase record
		const phaseRecord = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", phase),
			)
			.first()

		if (!phaseRecord) {
			throw new Error(`Phase ${phase} not found for task`)
		}

		if (phaseRecord.status !== "in_progress") {
			throw new Error(`Phase ${phase} is not in progress`)
		}

		const now = Date.now()

		// Update the phase record
		await ctx.db.patch(phaseRecord._id, {
			status: "completed",
			completedAt: now,
			...data,
		})

		// Clear active container on task
		await ctx.db.patch(taskId, {
			activeContainerId: undefined,
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		return phaseRecord._id
	},
})

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
		const { taskId, phase, error, ...data } = args

		// Get the phase record
		const phaseRecord = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", phase),
			)
			.first()

		if (!phaseRecord) {
			throw new Error(`Phase ${phase} not found for task`)
		}

		const now = Date.now()

		// Update the phase record
		await ctx.db.patch(phaseRecord._id, {
			status: "failed",
			completedAt: now,
			error,
			...data,
		})

		// Clear active container on task (container kept for debugging)
		await ctx.db.patch(taskId, {
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		return phaseRecord._id
	},
})

// Skip a phase
export const skipPhase = mutation({
	args: {
		taskId: v.id("tasks"),
		phase: taskPhaseValidator,
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { taskId, phase, reason } = args

		// Get the phase record
		const phaseRecord = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", phase),
			)
			.first()

		if (!phaseRecord) {
			throw new Error(`Phase ${phase} not found for task`)
		}

		if (phaseRecord.status !== "pending") {
			throw new Error(`Phase ${phase} is not in pending status`)
		}

		const now = Date.now()

		// Update the phase record
		await ctx.db.patch(phaseRecord._id, {
			status: "skipped",
			completedAt: now,
			result: reason,
		})

		// Update task phase timestamp
		await ctx.db.patch(taskId, {
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		return phaseRecord._id
	},
})

// Reset a failed phase to pending (for retry)
export const resetPhase = mutation({
	args: {
		taskId: v.id("tasks"),
		phase: taskPhaseValidator,
	},
	handler: async (ctx, args) => {
		const { taskId, phase } = args

		// Get the phase record
		const phaseRecord = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", phase),
			)
			.first()

		if (!phaseRecord) {
			throw new Error(`Phase ${phase} not found for task`)
		}

		if (phaseRecord.status !== "failed") {
			throw new Error(`Phase ${phase} is not in failed status`)
		}

		const now = Date.now()

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
		})

		// Update task phase timestamp
		await ctx.db.patch(taskId, {
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		return phaseRecord._id
	},
})

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
		const { taskId, phase, ...data } = args

		// Get the phase record
		const phaseRecord = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", phase),
			)
			.first()

		if (!phaseRecord) {
			throw new Error(`Phase ${phase} not found for task`)
		}

		await ctx.db.patch(phaseRecord._id, data)

		// Update active container on task if provided
		if (data.containerId) {
			await ctx.db.patch(taskId, {
				activeContainerId: data.containerId,
				updatedAt: Date.now(),
			})
		}

		return phaseRecord._id
	},
})

// Get phases by status (for monitoring)
export const listByStatus = query({
	args: { status: phaseStatusValidator },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("taskPhases")
			.withIndex("by_status", (q) => q.eq("status", args.status))
			.collect()
	},
})

// Update agent session ID for a phase (for session resumption tracking)
export const updateAgentSession = mutation({
	args: {
		taskId: v.id("tasks"),
		phase: taskPhaseValidator,
		agentSessionId: v.string(),
		containerId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const phaseDoc = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", args.taskId).eq("phase", args.phase),
			)
			.first()

		if (phaseDoc) {
			await ctx.db.patch(phaseDoc._id, {
				agentSessionId: args.agentSessionId,
				containerId: args.containerId,
			})

			// Also update the task's active session for chat resumption
			await ctx.db.patch(args.taskId, {
				activeSessionId: args.agentSessionId,
				activeContainerId: args.containerId,
				updatedAt: Date.now(),
			})
		}

		return phaseDoc?._id
	},
})
