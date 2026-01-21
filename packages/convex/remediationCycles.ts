import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { phaseStatusValidator } from "./validators"

// Remediation trigger type
const remediationTriggerValidator = v.union(
	v.literal("ai_review"),
	v.literal("human_review"),
)

// Default max remediation cycles
const DEFAULT_MAX_REMEDIATION_CYCLES = 3

// Get all remediation cycles for a task
export const listByTask = query({
	args: { taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const cycles = await ctx.db
			.query("remediationCycles")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect()
		return cycles.sort((a, b) => a.cycleNumber - b.cycleNumber)
	},
})

// Get a specific cycle by number
export const getCycle = query({
	args: {
		taskId: v.id("tasks"),
		cycleNumber: v.number(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("remediationCycles")
			.withIndex("by_task_and_cycle", (q) =>
				q.eq("taskId", args.taskId).eq("cycleNumber", args.cycleNumber),
			)
			.first()
	},
})

// Get the current (latest) cycle for a task
export const getCurrentCycle = query({
	args: { taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const cycles = await ctx.db
			.query("remediationCycles")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect()

		if (cycles.length === 0) return null

		// Return the cycle with the highest cycle number
		return cycles.reduce((latest, cycle) =>
			cycle.cycleNumber > latest.cycleNumber ? cycle : latest,
		)
	},
})

// Get the count of remediation cycles for a task
export const getCycleCount = query({
	args: { taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const cycles = await ctx.db
			.query("remediationCycles")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect()
		return cycles.length
	},
})

// Get max remediation cycles setting for a task
export const getMaxCycles = query({
	args: { taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		// First check for task-specific config
		const taskConfig = await ctx.db
			.query("phaseConfigs")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", args.taskId).eq("phase", "remediation"),
			)
			.first()

		if (taskConfig?.maxRemediationCycles) {
			return taskConfig.maxRemediationCycles
		}

		// Fall back to global default config
		const globalConfig = await ctx.db
			.query("phaseConfigs")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", undefined).eq("phase", "remediation"),
			)
			.first()

		return globalConfig?.maxRemediationCycles ?? DEFAULT_MAX_REMEDIATION_CYCLES
	},
})

// Start a new remediation cycle
export const startCycle = mutation({
	args: {
		taskId: v.id("tasks"),
		triggeredBy: remediationTriggerValidator,
		feedback: v.optional(v.string()), // Human's feedback when they request changes
		provider: v.optional(v.string()),
		model: v.optional(v.string()),
		prompt: v.optional(v.string()),
		permissionMode: v.optional(v.string()),
		containerId: v.optional(v.string()),
		agentSessionId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { taskId, triggeredBy, feedback, ...config } = args

		// Get existing cycles to determine the next cycle number
		const existingCycles = await ctx.db
			.query("remediationCycles")
			.withIndex("by_task", (q) => q.eq("taskId", taskId))
			.collect()

		const nextCycleNumber = existingCycles.length + 1

		// Check max cycles limit
		const maxCycles = await getMaxCyclesInternal(ctx, taskId)
		if (nextCycleNumber > maxCycles) {
			throw new Error(`Maximum remediation cycles (${maxCycles}) reached`)
		}

		const now = Date.now()

		// Create the new cycle
		const cycleId = await ctx.db.insert("remediationCycles", {
			taskId,
			cycleNumber: nextCycleNumber,
			triggeredBy,
			feedback,
			status: "in_progress",
			startedAt: now,
			...config,
			createdAt: now,
		})

		// Update the remediation phase record
		const remediationPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "remediation"),
			)
			.first()

		if (remediationPhase) {
			await ctx.db.patch(remediationPhase._id, {
				status: "in_progress",
				startedAt: now,
				currentRemediationCycle: nextCycleNumber,
				remediationTriggeredBy: triggeredBy,
				...config,
			})
		}

		// Update task current phase
		await ctx.db.patch(taskId, {
			currentPhase: "remediation",
			phaseUpdatedAt: now,
			activeContainerId: config.containerId,
			updatedAt: now,
		})

		return { cycleId, cycleNumber: nextCycleNumber }
	},
})

// Complete a remediation cycle
export const completeCycle = mutation({
	args: {
		taskId: v.id("tasks"),
		cycleNumber: v.number(),
		result: v.optional(v.string()),
		totalCostUsd: v.optional(v.number()),
		numTurns: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { taskId, cycleNumber, ...data } = args

		// Get the cycle
		const cycle = await ctx.db
			.query("remediationCycles")
			.withIndex("by_task_and_cycle", (q) =>
				q.eq("taskId", taskId).eq("cycleNumber", cycleNumber),
			)
			.first()

		if (!cycle) {
			throw new Error(`Remediation cycle ${cycleNumber} not found for task`)
		}

		if (cycle.status !== "in_progress") {
			throw new Error(`Remediation cycle ${cycleNumber} is not in progress`)
		}

		const now = Date.now()

		// Update the cycle
		await ctx.db.patch(cycle._id, {
			status: "completed",
			completedAt: now,
			...data,
		})

		// Update the remediation phase record
		const remediationPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "remediation"),
			)
			.first()

		if (remediationPhase) {
			await ctx.db.patch(remediationPhase._id, {
				completedAt: now,
				...data,
			})
		}

		// Clear active container on task
		await ctx.db.patch(taskId, {
			activeContainerId: undefined,
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		return cycle._id
	},
})

// Fail a remediation cycle
export const failCycle = mutation({
	args: {
		taskId: v.id("tasks"),
		cycleNumber: v.number(),
		error: v.string(),
		totalCostUsd: v.optional(v.number()),
		numTurns: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { taskId, cycleNumber, error, ...data } = args

		// Get the cycle
		const cycle = await ctx.db
			.query("remediationCycles")
			.withIndex("by_task_and_cycle", (q) =>
				q.eq("taskId", taskId).eq("cycleNumber", cycleNumber),
			)
			.first()

		if (!cycle) {
			throw new Error(`Remediation cycle ${cycleNumber} not found for task`)
		}

		const now = Date.now()

		// Update the cycle
		await ctx.db.patch(cycle._id, {
			status: "failed",
			completedAt: now,
			error,
			...data,
		})

		// Update the remediation phase record
		const remediationPhase = await ctx.db
			.query("taskPhases")
			.withIndex("by_task_and_phase", (q) =>
				q.eq("taskId", taskId).eq("phase", "remediation"),
			)
			.first()

		if (remediationPhase) {
			await ctx.db.patch(remediationPhase._id, {
				status: "failed",
				completedAt: now,
				error,
				...data,
			})
		}

		// Update task phase timestamp
		await ctx.db.patch(taskId, {
			phaseUpdatedAt: now,
			updatedAt: now,
		})

		return cycle._id
	},
})

// Update cycle agent session info
export const updateCycleSession = mutation({
	args: {
		taskId: v.id("tasks"),
		cycleNumber: v.number(),
		agentSessionId: v.optional(v.string()),
		containerId: v.optional(v.string()),
		totalCostUsd: v.optional(v.number()),
		numTurns: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { taskId, cycleNumber, ...data } = args

		// Get the cycle
		const cycle = await ctx.db
			.query("remediationCycles")
			.withIndex("by_task_and_cycle", (q) =>
				q.eq("taskId", taskId).eq("cycleNumber", cycleNumber),
			)
			.first()

		if (!cycle) {
			throw new Error(`Remediation cycle ${cycleNumber} not found for task`)
		}

		await ctx.db.patch(cycle._id, data)

		// Update active container on task if provided
		if (data.containerId) {
			await ctx.db.patch(taskId, {
				activeContainerId: data.containerId,
				updatedAt: Date.now(),
			})
		}

		return cycle._id
	},
})

// Check if max cycles reached
export const isMaxCyclesReached = query({
	args: { taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const cycles = await ctx.db
			.query("remediationCycles")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect()

		const maxCycles = await getMaxCyclesInternal(ctx, args.taskId)

		return {
			currentCount: cycles.length,
			maxCycles,
			isReached: cycles.length >= maxCycles,
		}
	},
})

// Internal helper to get max cycles (reusable in mutations)
async function getMaxCyclesInternal(ctx: any, taskId: any): Promise<number> {
	// First check for task-specific config
	const taskConfig = await ctx.db
		.query("phaseConfigs")
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
		.withIndex("by_task_and_phase", (q: any) =>
			q.eq("taskId", undefined).eq("phase", "remediation"),
		)
		.first()

	return globalConfig?.maxRemediationCycles ?? DEFAULT_MAX_REMEDIATION_CYCLES
}

// Get summary stats for remediation cycles
export const getSummary = query({
	args: { taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const cycles = await ctx.db
			.query("remediationCycles")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect()

		const maxCycles = await getMaxCyclesInternal(ctx, args.taskId)

		let totalCost = 0
		let totalTurns = 0
		let aiTriggered = 0
		let humanTriggered = 0

		for (const cycle of cycles) {
			if (cycle.totalCostUsd) totalCost += cycle.totalCostUsd
			if (cycle.numTurns) totalTurns += cycle.numTurns
			if (cycle.triggeredBy === "ai_review") aiTriggered++
			if (cycle.triggeredBy === "human_review") humanTriggered++
		}

		return {
			totalCycles: cycles.length,
			maxCycles,
			cyclesRemaining: Math.max(0, maxCycles - cycles.length),
			totalCostUsd: totalCost,
			totalTurns,
			aiTriggeredCount: aiTriggered,
			humanTriggeredCount: humanTriggered,
			currentCycle: cycles.find((c) => c.status === "in_progress") ?? null,
		}
	},
})
