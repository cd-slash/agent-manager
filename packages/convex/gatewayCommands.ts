import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import {
	commandPriorityValidator,
	gatewayCommandStatusValidator,
	taskPhaseValidator,
} from "./validators"

// Default retry configuration
const DEFAULT_MAX_RETRIES = 3
const EXECUTION_MAX_RETRIES = 2 // Fewer retries for executions

// Priority order for sorting (higher number = higher priority)
const PRIORITY_ORDER = {
	critical: 4,
	high: 3,
	normal: 2,
	low: 1,
} as const

// =============================================================================
// Frontend Mutations - Create commands for gateway to process
// =============================================================================

/**
 * Request container creation
 */
export const createContainer = mutation({
	args: {
		repo: v.string(),
		branch: v.optional(v.string()),
		name: v.optional(v.string()),
		server: v.optional(v.string()),
		sshUser: v.optional(v.string()),
		taskId: v.optional(v.string()),
		projectId: v.optional(v.string()),
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("gatewayCommands", {
			type: "createContainer",
			status: "pending",
			priority: args.priority ?? "normal",
			payload: {
				repo: args.repo,
				branch: args.branch,
				name: args.name,
				server: args.server,
				sshUser: args.sshUser,
			},
			taskId: args.taskId,
			projectId: args.projectId,
			retryCount: 0,
			maxRetries: DEFAULT_MAX_RETRIES,
			createdAt: now,
			updatedAt: now,
		})
	},
})

/**
 * Request container stop
 */
export const stopContainer = mutation({
	args: {
		containerName: v.string(),
		server: v.string(),
		sshUser: v.optional(v.string()),
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("gatewayCommands", {
			type: "stopContainer",
			status: "pending",
			priority: args.priority ?? "normal",
			payload: {
				containerName: args.containerName,
				server: args.server,
				sshUser: args.sshUser,
			},
			retryCount: 0,
			maxRetries: DEFAULT_MAX_RETRIES,
			createdAt: now,
			updatedAt: now,
		})
	},
})

/**
 * Request container deletion
 */
export const deleteContainer = mutation({
	args: {
		containerName: v.string(),
		server: v.string(),
		sshUser: v.optional(v.string()),
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("gatewayCommands", {
			type: "deleteContainer",
			status: "pending",
			priority: args.priority ?? "normal",
			payload: {
				containerName: args.containerName,
				server: args.server,
				sshUser: args.sshUser,
			},
			retryCount: 0,
			maxRetries: DEFAULT_MAX_RETRIES,
			createdAt: now,
			updatedAt: now,
		})
	},
})

/**
 * Request execution on a container
 * If no container is available, command will be queued
 */
export const startExecution = mutation({
	args: {
		containerId: v.optional(v.string()),
		message: v.string(),
		model: v.optional(v.string()),
		workingDirectory: v.optional(v.string()),
		permissionMode: v.optional(v.string()),
		systemPrompt: v.optional(v.string()),
		appendSystemPrompt: v.optional(v.string()),
		allowedTools: v.optional(v.array(v.string())),
		disallowedTools: v.optional(v.array(v.string())),
		maxBudget: v.optional(v.number()),
		taskId: v.optional(v.string()),
		projectId: v.optional(v.string()),
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		const correlationId = crypto.randomUUID()

		const commandId = await ctx.db.insert("gatewayCommands", {
			type: "startExecution",
			status: "pending",
			priority: args.priority ?? "normal",
			payload: {
				containerId: args.containerId,
				message: args.message,
				model: args.model,
				workingDirectory: args.workingDirectory,
				permissionMode: args.permissionMode,
				systemPrompt: args.systemPrompt,
				appendSystemPrompt: args.appendSystemPrompt,
				allowedTools: args.allowedTools,
				disallowedTools: args.disallowedTools,
				maxBudget: args.maxBudget,
			},
			correlationId,
			taskId: args.taskId,
			projectId: args.projectId,
			retryCount: 0,
			maxRetries: EXECUTION_MAX_RETRIES,
			createdAt: now,
			updatedAt: now,
		})

		// Also create an entry in the execution queue for better tracking
		await ctx.db.insert("executionQueue", {
			commandId,
			taskId: args.taskId,
			projectId: args.projectId,
			priority: args.priority ?? "normal",
			queuedAt: now,
			status: "waiting",
		})

		return commandId
	},
})

/**
 * Request execution abort
 */
export const abortExecution = mutation({
	args: {
		correlationId: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now()

		// Also update the execution queue if it exists
		const queueEntry = await ctx.db
			.query("executionQueue")
			.filter((q) =>
				q.eq(
					q.field("status"),
					q.or(
						q.eq(q.field("status"), "waiting"),
						q.eq(q.field("status"), "assigned"),
						q.eq(q.field("status"), "executing"),
					),
				),
			)
			.first()

		if (queueEntry) {
			await ctx.db.patch(queueEntry._id, {
				status: "cancelled",
				completedAt: now,
			})
		}

		return await ctx.db.insert("gatewayCommands", {
			type: "abortExecution",
			status: "pending",
			priority: "critical", // Abort commands are always high priority
			payload: {
				correlationId: args.correlationId,
			},
			correlationId: args.correlationId,
			retryCount: 0,
			maxRetries: 1, // Only one attempt for abort
			createdAt: now,
			updatedAt: now,
		})
	},
})

/**
 * Request auth token push to container
 */
export const pushAuthToken = mutation({
	args: {
		containerId: v.string(),
		token: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("gatewayCommands", {
			type: "pushAuthToken",
			status: "pending",
			priority: "high", // Auth tokens should be pushed quickly
			payload: {
				containerId: args.containerId,
				token: args.token,
			},
			retryCount: 0,
			maxRetries: DEFAULT_MAX_RETRIES,
			createdAt: now,
			updatedAt: now,
		})
	},
})

/**
 * Request OAuth flow start on a container
 * Container will run `claude setup-token` and return the OAuth URL
 */
export const startOAuthFlow = mutation({
	args: {
		containerId: v.string(),
		provider: v.string(),
		oauthFlowId: v.string(), // Reference to oauthFlows table
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("gatewayCommands", {
			type: "startOAuthFlow",
			status: "pending",
			priority: "high",
			payload: {
				containerId: args.containerId,
				provider: args.provider,
				oauthFlowId: args.oauthFlowId,
			},
			assignedContainerId: args.containerId,
			correlationId: args.oauthFlowId,
			retryCount: 0,
			maxRetries: 1, // OAuth flows shouldn't retry
			createdAt: now,
			updatedAt: now,
		})
	},
})

/**
 * Request OAuth flow completion on a container
 * Container will complete the OAuth flow with the auth code
 */
export const completeOAuthFlow = mutation({
	args: {
		containerId: v.string(),
		oauthFlowId: v.string(),
		containerFlowId: v.string(), // Flow ID from the container
		authCode: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("gatewayCommands", {
			type: "completeOAuthFlow",
			status: "pending",
			priority: "high",
			payload: {
				containerId: args.containerId,
				oauthFlowId: args.oauthFlowId,
				containerFlowId: args.containerFlowId,
				authCode: args.authCode,
			},
			assignedContainerId: args.containerId,
			correlationId: args.oauthFlowId,
			retryCount: 0,
			maxRetries: 1,
			createdAt: now,
			updatedAt: now,
		})
	},
})

/**
 * Request task phase execution
 */
export const startPhaseExecution = mutation({
	args: {
		taskId: v.string(),
		phase: taskPhaseValidator,
		containerId: v.optional(v.string()),
		customPrompt: v.optional(v.string()),
		configOverrides: v.optional(v.any()),
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		const correlationId = crypto.randomUUID()

		const commandId = await ctx.db.insert("gatewayCommands", {
			type: "startPhaseExecution",
			status: "pending",
			priority: args.priority ?? "normal",
			payload: {
				taskId: args.taskId,
				phase: args.phase,
				containerId: args.containerId,
				customPrompt: args.customPrompt,
				configOverrides: args.configOverrides,
			},
			correlationId,
			taskId: args.taskId,
			retryCount: 0,
			maxRetries: EXECUTION_MAX_RETRIES,
			createdAt: now,
			updatedAt: now,
		})

		// Also create an entry in the execution queue
		await ctx.db.insert("executionQueue", {
			commandId,
			taskId: args.taskId,
			priority: args.priority ?? "normal",
			queuedAt: now,
			status: "waiting",
		})

		return commandId
	},
})

// =============================================================================
// Queries - For frontend to check status and gateway to get work
// =============================================================================

/**
 * Get a specific command by ID
 */
export const get = query({
	args: { id: v.id("gatewayCommands") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id)
	},
})

/**
 * Get pending commands for gateway to process
 * Returns commands ordered by priority (highest first), then by creation time
 */
export const getPending = query({
	args: {},
	handler: async (ctx) => {
		const commands = await ctx.db
			.query("gatewayCommands")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect()

		// Sort by priority (descending) then createdAt (ascending)
		return commands.sort((a, b) => {
			const priorityDiff =
				PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
			if (priorityDiff !== 0) return priorityDiff
			return a.createdAt - b.createdAt
		})
	},
})

/**
 * Get queued commands (waiting for container)
 */
export const getQueued = query({
	args: {},
	handler: async (ctx) => {
		const commands = await ctx.db
			.query("gatewayCommands")
			.withIndex("by_status", (q) => q.eq("status", "queued"))
			.collect()

		// Sort by priority (descending) then queuedAt (ascending)
		return commands.sort((a, b) => {
			const priorityDiff =
				PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
			if (priorityDiff !== 0) return priorityDiff
			return (a.queuedAt ?? a.createdAt) - (b.queuedAt ?? b.createdAt)
		})
	},
})

/**
 * Get commands by status
 */
export const getByStatus = query({
	args: { status: gatewayCommandStatusValidator },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("gatewayCommands")
			.withIndex("by_status", (q) => q.eq("status", args.status))
			.collect()
	},
})

/**
 * Get recent commands (for monitoring/debugging)
 */
export const getRecent = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50
		return await ctx.db.query("gatewayCommands").order("desc").take(limit)
	},
})

/**
 * Get command by correlation ID
 */
export const getByCorrelationId = query({
	args: { correlationId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("gatewayCommands")
			.withIndex("by_correlation_id", (q) =>
				q.eq("correlationId", args.correlationId),
			)
			.first()
	},
})

/**
 * Get commands for a specific task
 */
export const getByTask = query({
	args: { taskId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("gatewayCommands")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect()
	},
})

/**
 * Get commands assigned to a specific container (for container to poll)
 * Returns pending/queued/processing commands assigned to this container
 */
export const getByAssignedContainer = query({
	args: { containerId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("gatewayCommands")
			.withIndex("by_assigned_container", (q) =>
				q.eq("assignedContainerId", args.containerId),
			)
			.filter((q) =>
				q.or(
					q.eq(q.field("status"), "pending"),
					q.eq(q.field("status"), "queued"),
					q.eq(q.field("status"), "processing"),
				),
			)
			.collect()
	},
})

/**
 * Get queue statistics
 */
export const getQueueStats = query({
	args: {},
	handler: async (ctx) => {
		const pending = await ctx.db
			.query("gatewayCommands")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect()

		const queued = await ctx.db
			.query("gatewayCommands")
			.withIndex("by_status", (q) => q.eq("status", "queued"))
			.collect()

		const processing = await ctx.db
			.query("gatewayCommands")
			.withIndex("by_status", (q) => q.eq("status", "processing"))
			.collect()

		// Count by priority
		const byPriority = {
			critical: 0,
			high: 0,
			normal: 0,
			low: 0,
		}

		for (const cmd of [...pending, ...queued]) {
			byPriority[cmd.priority]++
		}

		return {
			pending: pending.length,
			queued: queued.length,
			processing: processing.length,
			total: pending.length + queued.length + processing.length,
			byPriority,
		}
	},
})

// =============================================================================
// Gateway Mutations - Update command status
// =============================================================================

/**
 * Mark command as processing (gateway picked it up)
 */
export const markProcessing = mutation({
	args: { id: v.id("gatewayCommands") },
	handler: async (ctx, args) => {
		const now = Date.now()
		await ctx.db.patch(args.id, {
			status: "processing",
			processedAt: now,
			updatedAt: now,
		})
	},
})

/**
 * Mark command as queued (waiting for container)
 */
export const markQueued = mutation({
	args: {
		id: v.id("gatewayCommands"),
		queuePosition: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		await ctx.db.patch(args.id, {
			status: "queued",
			queuedAt: now,
			queuePosition: args.queuePosition,
			updatedAt: now,
		})
	},
})

/**
 * Assign a container to a queued command
 */
export const assignContainer = mutation({
	args: {
		id: v.id("gatewayCommands"),
		containerId: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		await ctx.db.patch(args.id, {
			status: "processing",
			assignedContainerId: args.containerId,
			processedAt: now,
			updatedAt: now,
		})

		// Update execution queue if exists
		const queueEntry = await ctx.db
			.query("executionQueue")
			.withIndex("by_command", (q) => q.eq("commandId", args.id))
			.first()

		if (queueEntry) {
			await ctx.db.patch(queueEntry._id, {
				status: "assigned",
				assignedContainerId: args.containerId,
				assignedAt: now,
			})
		}
	},
})

/**
 * Mark command as completed with result
 */
export const complete = mutation({
	args: {
		id: v.id("gatewayCommands"),
		result: v.any(),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		await ctx.db.patch(args.id, {
			status: "completed",
			result: args.result,
			completedAt: now,
			updatedAt: now,
		})

		// Update execution queue if exists
		const queueEntry = await ctx.db
			.query("executionQueue")
			.withIndex("by_command", (q) => q.eq("commandId", args.id))
			.first()

		if (queueEntry) {
			await ctx.db.patch(queueEntry._id, {
				status: "completed",
				completedAt: now,
			})
		}
	},
})

/**
 * Mark command as failed with error
 * Will retry if retries remaining, otherwise permanent failure
 */
export const fail = mutation({
	args: {
		id: v.id("gatewayCommands"),
		error: v.string(),
		canRetry: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const command = await ctx.db.get(args.id)
		if (!command) return

		const now = Date.now()
		const canRetry = args.canRetry !== false
		const shouldRetry = canRetry && command.retryCount < command.maxRetries

		if (shouldRetry) {
			// Increment retry count and return to pending
			await ctx.db.patch(args.id, {
				status: "pending",
				retryCount: command.retryCount + 1,
				lastError: args.error,
				updatedAt: now,
			})
		} else {
			// Permanent failure
			await ctx.db.patch(args.id, {
				status: "failed",
				error: args.error,
				completedAt: now,
				updatedAt: now,
			})

			// Update execution queue if exists
			const queueEntry = await ctx.db
				.query("executionQueue")
				.withIndex("by_command", (q) => q.eq("commandId", args.id))
				.first()

			if (queueEntry) {
				await ctx.db.patch(queueEntry._id, {
					status: "failed",
					completedAt: now,
				})
			}
		}

		return { retried: shouldRetry }
	},
})

/**
 * Cancel a pending or queued command (before gateway completes it)
 */
export const cancel = mutation({
	args: { id: v.id("gatewayCommands") },
	handler: async (ctx, args) => {
		const command = await ctx.db.get(args.id)
		if (!command) {
			throw new Error("Command not found")
		}

		if (command.status !== "pending" && command.status !== "queued") {
			throw new Error(`Cannot cancel command in status: ${command.status}`)
		}

		const now = Date.now()
		await ctx.db.patch(args.id, {
			status: "failed",
			error: "Cancelled by user",
			completedAt: now,
			updatedAt: now,
		})

		// Update execution queue if exists
		const queueEntry = await ctx.db
			.query("executionQueue")
			.withIndex("by_command", (q) => q.eq("commandId", args.id))
			.first()

		if (queueEntry) {
			await ctx.db.patch(queueEntry._id, {
				status: "cancelled",
				completedAt: now,
			})
		}
	},
})

// =============================================================================
// Cleanup - Remove old completed/failed commands
// =============================================================================

/**
 * Delete old completed commands (for cleanup)
 */
export const cleanupOld = mutation({
	args: {
		olderThanMs: v.number(), // Delete commands older than this many ms
	},
	handler: async (ctx, args) => {
		const cutoff = Date.now() - args.olderThanMs

		const oldCommands = await ctx.db
			.query("gatewayCommands")
			.filter((q) =>
				q.and(
					q.or(
						q.eq(q.field("status"), "completed"),
						q.eq(q.field("status"), "failed"),
					),
					q.lt(q.field("completedAt"), cutoff),
				),
			)
			.collect()

		let deleted = 0
		for (const cmd of oldCommands) {
			// Also delete associated execution queue entries
			const queueEntry = await ctx.db
				.query("executionQueue")
				.withIndex("by_command", (q) => q.eq("commandId", cmd._id))
				.first()

			if (queueEntry) {
				await ctx.db.delete(queueEntry._id)
			}

			await ctx.db.delete(cmd._id)
			deleted++
		}

		return { deleted }
	},
})
