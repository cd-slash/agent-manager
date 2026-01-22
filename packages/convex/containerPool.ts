/**
 * Container Pool Management
 *
 * Tracks container availability and manages assignment of containers to execution commands.
 * The gateway maintains this state based on container connections and execution lifecycle.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { containerPoolStatusValidator } from "./validators"

// =============================================================================
// Queries
// =============================================================================

/**
 * Get a specific container from the pool
 */
export const get = query({
	args: { containerId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("containerPool")
			.withIndex("by_container_id", (q) => q.eq("containerId", args.containerId))
			.first()
	},
})

/**
 * Get all containers in the pool
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("containerPool").collect()
	},
})

/**
 * Get containers by status
 */
export const getByStatus = query({
	args: { status: containerPoolStatusValidator },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("containerPool")
			.withIndex("by_status", (q) => q.eq("status", args.status))
			.collect()
	},
})

/**
 * Get idle containers available for work
 * Returns containers sorted by last activity (least recently used first)
 */
export const getAvailable = query({
	args: {},
	handler: async (ctx) => {
		const containers = await ctx.db
			.query("containerPool")
			.withIndex("by_status", (q) => q.eq("status", "idle"))
			.collect()

		// Sort by last activity (oldest first - LRU)
		return containers.sort((a, b) => a.lastActivityAt - b.lastActivityAt)
	},
})

/**
 * Get pool statistics
 */
export const getStats = query({
	args: {},
	handler: async (ctx) => {
		const all = await ctx.db.query("containerPool").collect()

		const stats = {
			total: all.length,
			idle: 0,
			busy: 0,
			reserved: 0,
			offline: 0,
		}

		for (const container of all) {
			stats[container.status]++
		}

		return stats
	},
})

/**
 * Find a container for a specific task
 * Prefers containers already reserved for this task, then idle containers
 */
export const findForTask = query({
	args: { taskId: v.string() },
	handler: async (ctx, args) => {
		// First check if there's a container reserved for this task
		const reserved = await ctx.db
			.query("containerPool")
			.filter((q) =>
				q.and(
					q.eq(q.field("reservedForTaskId"), args.taskId),
					q.eq(q.field("status"), "reserved"),
				),
			)
			.first()

		if (reserved) return reserved

		// Otherwise find any idle container
		const idle = await ctx.db
			.query("containerPool")
			.withIndex("by_status", (q) => q.eq("status", "idle"))
			.first()

		return idle
	},
})

// =============================================================================
// Mutations - Container Lifecycle
// =============================================================================

/**
 * Register a container in the pool (called when container connects)
 */
export const register = mutation({
	args: {
		containerId: v.string(),
		hostname: v.string(),
		capabilities: v.optional(v.array(v.string())),
		maxConcurrent: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const now = Date.now()

		// Check if container already exists
		const existing = await ctx.db
			.query("containerPool")
			.withIndex("by_container_id", (q) => q.eq("containerId", args.containerId))
			.first()

		if (existing) {
			// Update existing container
			await ctx.db.patch(existing._id, {
				hostname: args.hostname,
				status: "idle",
				capabilities: args.capabilities,
				maxConcurrent: args.maxConcurrent ?? 1,
				connectedAt: now,
				lastActivityAt: now,
				lastHealthCheck: now,
			})
			return existing._id
		}

		// Create new container entry
		return await ctx.db.insert("containerPool", {
			containerId: args.containerId,
			hostname: args.hostname,
			status: "idle",
			capabilities: args.capabilities,
			maxConcurrent: args.maxConcurrent ?? 1,
			currentLoad: 0,
			connectedAt: now,
			lastActivityAt: now,
			lastHealthCheck: now,
		})
	},
})

/**
 * Unregister a container from the pool (called when container disconnects)
 */
export const unregister = mutation({
	args: { containerId: v.string() },
	handler: async (ctx, args) => {
		const container = await ctx.db
			.query("containerPool")
			.withIndex("by_container_id", (q) => q.eq("containerId", args.containerId))
			.first()

		if (container) {
			await ctx.db.patch(container._id, {
				status: "offline",
				lastActivityAt: Date.now(),
			})
		}
	},
})

/**
 * Mark a container as offline
 */
export const markOffline = mutation({
	args: { containerId: v.string() },
	handler: async (ctx, args) => {
		const container = await ctx.db
			.query("containerPool")
			.withIndex("by_container_id", (q) => q.eq("containerId", args.containerId))
			.first()

		if (container) {
			await ctx.db.patch(container._id, {
				status: "offline",
				lastActivityAt: Date.now(),
			})
		}
	},
})

/**
 * Update health check timestamp
 */
export const updateHealthCheck = mutation({
	args: { containerId: v.string() },
	handler: async (ctx, args) => {
		const container = await ctx.db
			.query("containerPool")
			.withIndex("by_container_id", (q) => q.eq("containerId", args.containerId))
			.first()

		if (container) {
			await ctx.db.patch(container._id, {
				lastHealthCheck: Date.now(),
			})
		}
	},
})

// =============================================================================
// Mutations - Execution Assignment
// =============================================================================

/**
 * Acquire a container for execution
 * Sets container status to busy and records the session
 */
export const acquire = mutation({
	args: {
		containerId: v.string(),
		sessionId: v.string(),
		commandId: v.id("gatewayCommands"),
	},
	handler: async (ctx, args) => {
		const now = Date.now()

		const container = await ctx.db
			.query("containerPool")
			.withIndex("by_container_id", (q) => q.eq("containerId", args.containerId))
			.first()

		if (!container) {
			throw new Error(`Container ${args.containerId} not found in pool`)
		}

		if (container.status !== "idle" && container.status !== "reserved") {
			throw new Error(
				`Container ${args.containerId} is not available (status: ${container.status})`,
			)
		}

		await ctx.db.patch(container._id, {
			status: "busy",
			currentSessionId: args.sessionId,
			currentCommandId: args.commandId,
			currentLoad: container.currentLoad + 1,
			lastActivityAt: now,
		})

		return { acquired: true }
	},
})

/**
 * Release a container after execution completes
 * Sets container status back to idle
 */
export const release = mutation({
	args: {
		containerId: v.string(),
		sessionId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now()

		const container = await ctx.db
			.query("containerPool")
			.withIndex("by_container_id", (q) => q.eq("containerId", args.containerId))
			.first()

		if (!container) {
			return { released: false, error: "Container not found" }
		}

		// Verify session matches if provided
		if (args.sessionId && container.currentSessionId !== args.sessionId) {
			return { released: false, error: "Session mismatch" }
		}

		const newLoad = Math.max(0, container.currentLoad - 1)

		await ctx.db.patch(container._id, {
			status: newLoad === 0 ? "idle" : "busy",
			currentSessionId: newLoad === 0 ? undefined : container.currentSessionId,
			currentCommandId: newLoad === 0 ? undefined : container.currentCommandId,
			currentLoad: newLoad,
			lastActivityAt: now,
		})

		return { released: true }
	},
})

/**
 * Reserve a container for a specific task
 * Used when a task needs dedicated container access
 */
export const reserve = mutation({
	args: {
		containerId: v.string(),
		taskId: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now()

		const container = await ctx.db
			.query("containerPool")
			.withIndex("by_container_id", (q) => q.eq("containerId", args.containerId))
			.first()

		if (!container) {
			throw new Error(`Container ${args.containerId} not found in pool`)
		}

		if (container.status !== "idle") {
			throw new Error(
				`Container ${args.containerId} is not available for reservation`,
			)
		}

		await ctx.db.patch(container._id, {
			status: "reserved",
			reservedForTaskId: args.taskId,
			lastActivityAt: now,
		})

		return { reserved: true }
	},
})

/**
 * Unreserve a container
 */
export const unreserve = mutation({
	args: {
		containerId: v.string(),
		taskId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now()

		const container = await ctx.db
			.query("containerPool")
			.withIndex("by_container_id", (q) => q.eq("containerId", args.containerId))
			.first()

		if (!container) {
			return { unreserved: false, error: "Container not found" }
		}

		// Verify task matches if provided
		if (args.taskId && container.reservedForTaskId !== args.taskId) {
			return { unreserved: false, error: "Task mismatch" }
		}

		await ctx.db.patch(container._id, {
			status: "idle",
			reservedForTaskId: undefined,
			lastActivityAt: now,
		})

		return { unreserved: true }
	},
})

// =============================================================================
// Mutations - Cleanup
// =============================================================================

/**
 * Remove stale offline containers from the pool
 */
export const cleanupOffline = mutation({
	args: {
		olderThanMs: v.number(),
	},
	handler: async (ctx, args) => {
		const cutoff = Date.now() - args.olderThanMs

		const offline = await ctx.db
			.query("containerPool")
			.withIndex("by_status", (q) => q.eq("status", "offline"))
			.filter((q) => q.lt(q.field("lastActivityAt"), cutoff))
			.collect()

		let deleted = 0
		for (const container of offline) {
			await ctx.db.delete(container._id)
			deleted++
		}

		return { deleted }
	},
})
