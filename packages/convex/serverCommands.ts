import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import {
	commandPriorityValidator,
	gatewayCommandStatusValidator,
} from "./validators"

// Default retry configuration
const DEFAULT_MAX_RETRIES = 3

// Priority order for sorting (higher number = higher priority)
const PRIORITY_ORDER = {
	critical: 4,
	high: 3,
	normal: 2,
	low: 1,
} as const

// =============================================================================
// Server Command Mutations - Create commands for gateway to process via SSH
// =============================================================================

/**
 * Request container creation
 */
export const createContainer = mutation({
	args: {
		repo: v.optional(v.string()), // Optional - management containers don't need repos
		branch: v.optional(v.string()),
		name: v.optional(v.string()),
		server: v.optional(v.string()),
		sshUser: v.optional(v.string()),
		taskId: v.optional(v.string()),
		projectId: v.optional(v.string()),
		containerType: v.optional(v.string()), // "agent" or "management"
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("serverCommands", {
			type: "createContainer",
			status: "pending",
			priority: args.priority ?? "normal",
			payload: {
				repo: args.repo,
				branch: args.branch,
				name: args.name,
				server: args.server,
				sshUser: args.sshUser,
				containerType: args.containerType ?? "agent",
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
		return await ctx.db.insert("serverCommands", {
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
 * Request container restart with fresh Tailscale auth key
 */
export const restartContainer = mutation({
	args: {
		containerName: v.string(),
		server: v.string(),
		sshUser: v.optional(v.string()),
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("serverCommands", {
			type: "restartContainer",
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
		return await ctx.db.insert("serverCommands", {
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
 * Request listing containers on a server (for orphan detection)
 */
export const listContainers = mutation({
	args: {
		server: v.string(),
		sshUser: v.optional(v.string()),
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("serverCommands", {
			type: "listContainers",
			status: "pending",
			priority: args.priority ?? "high",
			payload: {
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

// =============================================================================
// Queries - For gateway to get work and frontend to check status
// =============================================================================

/**
 * Get a specific command by ID
 */
export const get = query({
	args: { id: v.id("serverCommands") },
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
			.query("serverCommands")
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
 * Get commands by status
 */
export const getByStatus = query({
	args: { status: gatewayCommandStatusValidator },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("serverCommands")
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
		return await ctx.db.query("serverCommands").order("desc").take(limit)
	},
})

/**
 * Get commands for a specific task
 */
export const getByTask = query({
	args: { taskId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("serverCommands")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect()
	},
})

// =============================================================================
// Gateway Mutations - Update command status
// =============================================================================

/**
 * Mark command as processing (gateway picked it up)
 */
export const markProcessing = mutation({
	args: { id: v.id("serverCommands") },
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
 * Update command payload (used to store generated values like container names)
 * This ensures retries use the same generated values instead of creating new ones
 */
export const updatePayload = mutation({
	args: {
		id: v.id("serverCommands"),
		payload: v.any(),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		await ctx.db.patch(args.id, {
			payload: args.payload,
			updatedAt: now,
		})
	},
})

/**
 * Mark command as completed with result
 */
export const complete = mutation({
	args: {
		id: v.id("serverCommands"),
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
	},
})

/**
 * Mark command as failed with error
 * Will retry if retries remaining, otherwise permanent failure
 */
export const fail = mutation({
	args: {
		id: v.id("serverCommands"),
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
		}
	},
})
