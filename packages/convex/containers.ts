import { v } from "convex/values"
import {
	action,
	internalMutation,
	mutation,
	query,
} from "./_generated/server"
import { api } from "./_generated/api"
import { patchWithTimestamp } from "./internal/updateUtils"
import { containerStatusValidator, containerTypeValidator } from "./validators"

// List all containers
export const list = query({
	args: {},
	handler: async (ctx) => {
		const containers = await ctx.db.query("containers").collect()
		// Enrich with server info
		const enriched = await Promise.all(
			containers.map(async (container) => {
				const server = container.serverId
					? await ctx.db.get(container.serverId)
					: null
				return { ...container, serverName: server?.name ?? null }
			}),
		)
		return enriched
	},
})

// List containers by server
export const listByServer = query({
	args: { serverId: v.id("servers") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("containers")
			.withIndex("by_server", (q) => q.eq("serverId", args.serverId))
			.collect()
	},
})

// List containers by status
export const listByStatus = query({
	args: { status: containerStatusValidator },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("containers")
			.withIndex("by_status", (q) => q.eq("status", args.status))
			.collect()
	},
})

// Get container by ID
export const get = query({
	args: { id: v.id("containers") },
	handler: async (ctx, args) => {
		const container = await ctx.db.get(args.id)
		if (!container) return null

		const server = container.serverId
			? await ctx.db.get(container.serverId)
			: null
		return { ...container, serverName: server?.name ?? null }
	},
})

// Get container stats
export const getStats = query({
	args: {},
	handler: async (ctx) => {
		const containers = await ctx.db.query("containers").collect()

		const running = containers.filter((c) => c.status === "running").length
		const stopped = containers.filter((c) => c.status === "stopped").length
		const restarting = containers.filter(
			(c) => c.status === "restarting",
		).length
		const paused = containers.filter((c) => c.status === "paused").length
		const exited = containers.filter((c) => c.status === "exited").length

		return {
			total: containers.length,
			running,
			stopped,
			restarting,
			paused,
			exited,
		}
	},
})

// Create a new container
export const create = mutation({
	args: {
		serverId: v.id("servers"),
		containerId: v.string(),
		name: v.string(),
		image: v.string(),
		port: v.string(),
		status: v.optional(containerStatusValidator),
	},
	handler: async (ctx, args) => {
		// Verify server exists
		const server = await ctx.db.get(args.serverId)
		if (!server) throw new Error("Server not found")

		const now = Date.now()
		const id = await ctx.db.insert("containers", {
			serverId: args.serverId,
			containerId: args.containerId,
			name: args.name,
			image: args.image,
			port: args.port,
			status: args.status ?? "stopped",
			createdAt: now,
			updatedAt: now,
		})

		return id
	},
})

// Update container details
export const update = mutation({
	args: {
		id: v.id("containers"),
		name: v.optional(v.string()),
		image: v.optional(v.string()),
		port: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { id, ...updates } = args
		const existing = await ctx.db.get(id)
		if (!existing) throw new Error("Container not found")

		await patchWithTimestamp(ctx.db, id, updates)
	},
})

// Update container status
export const updateStatus = mutation({
	args: {
		id: v.id("containers"),
		status: containerStatusValidator,
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id)
		if (!existing) throw new Error("Container not found")

		await ctx.db.patch(args.id, {
			status: args.status,
			updatedAt: Date.now(),
		})
	},
})

// Start a container
export const start = mutation({
	args: { id: v.id("containers") },
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id)
		if (!existing) throw new Error("Container not found")

		await ctx.db.patch(args.id, {
			status: "running",
			updatedAt: Date.now(),
		})
	},
})

// Stop a container
export const stop = mutation({
	args: { id: v.id("containers") },
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id)
		if (!existing) throw new Error("Container not found")

		await ctx.db.patch(args.id, {
			status: "stopped",
			updatedAt: Date.now(),
		})
	},
})

// Restart a container
export const restart = mutation({
	args: { id: v.id("containers") },
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id)
		if (!existing) throw new Error("Container not found")

		// First set to restarting
		await ctx.db.patch(args.id, {
			status: "restarting",
			updatedAt: Date.now(),
		})

		// In real implementation, this would trigger actual restart
		// and the status would be updated via webhook/callback
	},
})

// Pause a container
export const pause = mutation({
	args: { id: v.id("containers") },
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id)
		if (!existing) throw new Error("Container not found")

		await ctx.db.patch(args.id, {
			status: "paused",
			updatedAt: Date.now(),
		})
	},
})

// Unpause a container
export const unpause = mutation({
	args: { id: v.id("containers") },
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id)
		if (!existing) throw new Error("Container not found")

		await ctx.db.patch(args.id, {
			status: "running",
			updatedAt: Date.now(),
		})
	},
})

// Delete a container
export const deleteContainer = mutation({
	args: { id: v.id("containers") },
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id)
		if (!existing) throw new Error("Container not found")

		await ctx.db.delete(args.id)
	},
})

// Move container to different server
export const moveToServer = mutation({
	args: {
		id: v.id("containers"),
		newServerId: v.id("servers"),
	},
	handler: async (ctx, args) => {
		const container = await ctx.db.get(args.id)
		if (!container) throw new Error("Container not found")

		const server = await ctx.db.get(args.newServerId)
		if (!server) throw new Error("Target server not found")

		await ctx.db.patch(args.id, {
			serverId: args.newServerId,
			updatedAt: Date.now(),
		})
	},
})

// Update agent status (called by agent-gateway)
export const updateAgentStatus = mutation({
	args: {
		containerId: v.string(),
		hostname: v.string(),
		agentStatus: v.union(v.literal("online"), v.literal("offline")),
		lastSeenAt: v.number(),
	},
	handler: async (ctx, args) => {
		// Find container by containerId (Docker ID or tailscale ID)
		const container = await ctx.db
			.query("containers")
			.filter((q) => q.eq(q.field("containerId"), args.containerId))
			.first()

		if (!container) {
			// Container not found - could be a new container, log and return
			console.log(`Container not found: ${args.containerId}`)
			return null
		}

		// Update the container status based on agent connection
		const status = args.agentStatus === "online" ? "running" : container.status

		await ctx.db.patch(container._id, {
			status,
			updatedAt: args.lastSeenAt,
		})

		return container._id
	},
})

// Get container by containerId (Docker/Tailscale ID)
export const getByContainerId = query({
	args: { containerId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("containers")
			.filter((q) => q.eq(q.field("containerId"), args.containerId))
			.first()
	},
})

// Create container record from agent-gateway (called when a new container is created via serverCommands)
export const createFromAgent = mutation({
	args: {
		containerId: v.string(),
		name: v.string(),
		hostname: v.string(),
		repo: v.string(),
		branch: v.string(),
		server: v.string(),
		network: v.union(v.literal("macvlan"), v.literal("bridge")),
		lanIp: v.optional(v.string()),
		wgPort: v.optional(v.number()),
		taskId: v.optional(v.id("tasks")),
		projectId: v.optional(v.id("projects")),
		containerType: v.optional(containerTypeValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()

		// Check if container already exists
		const existing = await ctx.db
			.query("containers")
			.filter((q) => q.eq(q.field("containerId"), args.containerId))
			.first()

		if (existing) {
			// Update existing container
			await ctx.db.patch(existing._id, {
				name: args.name,
				serverHostname: args.server,
				tailscaleHostname: args.hostname,
				status: "running",
				containerType: args.containerType,
				updatedAt: now,
			})
			return existing._id
		}

		// Create new container
		const id = await ctx.db.insert("containers", {
			containerId: args.containerId,
			name: args.name,
			image: `agent:${args.repo}@${args.branch}`,
			status: "running",
			port: args.network === "macvlan" ? "80" : String(args.wgPort || 4096),
			serverHostname: args.server,
			tailscaleHostname: args.hostname,
			containerType: args.containerType ?? "agent",
			createdAt: now,
			updatedAt: now,
		})

		return id
	},
})

// List containers by type
export const listByType = query({
	args: { containerType: containerTypeValidator },
	handler: async (ctx, args) => {
		const containers = await ctx.db
			.query("containers")
			.withIndex("by_container_type", (q) =>
				q.eq("containerType", args.containerType),
			)
			.collect()

		// Enrich with server info
		const enriched = await Promise.all(
			containers.map(async (container) => {
				const server = container.serverId
					? await ctx.db.get(container.serverId)
					: null
				return { ...container, serverName: server?.name ?? null }
			}),
		)
		return enriched
	},
})

// =============================================================================
// Cleanup Functions
// =============================================================================

/**
 * Mark orphaned containers as stopped.
 * Orphaned containers are those that:
 * - Don't have a tailscaleNodeId (not managed by Tailscale sync)
 * - Are not actively registered in the containerPool
 *
 * Note: We mark as stopped instead of deleting because the Docker container
 * may still exist on the host and can be started again.
 */
export const cleanupOrphanedContainers = mutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now()
		const containers = await ctx.db.query("containers").collect()
		const poolEntries = await ctx.db.query("containerPool").collect()

		// Get all active container IDs from the pool
		const activeContainerIds = new Set(poolEntries.map((p) => p.containerId))

		let updated = 0
		const updatedContainers: string[] = []

		for (const container of containers) {
			// Skip containers managed by Tailscale - they're handled by Tailscale sync
			if (container.tailscaleNodeId) {
				continue
			}

			// Skip containers that are actively registered in the pool
			if (activeContainerIds.has(container.containerId)) {
				continue
			}

			// Skip containers updated in the last 5 minutes (might be starting up)
			if (container.updatedAt && now - container.updatedAt < 5 * 60 * 1000) {
				continue
			}

			// Skip containers that are already stopped
			if (container.status === "stopped" || container.status === "exited") {
				continue
			}

			// This container is orphaned - mark as stopped
			await ctx.db.patch(container._id, {
				status: "stopped",
				updatedAt: now,
			})
			updated++
			updatedContainers.push(container.name)
		}

		// Return 'deleted: 0' for backwards compatibility with callers expecting that field
		return { deleted: 0, updated, containers: updatedContainers }
	},
})

// =============================================================================
// Internal Mutations (for use by actions)
// =============================================================================

// Internal mutation to clean up orphaned containers (called from actions like Tailscale sync)
// NOTE: This is kept for backwards compatibility but now marks as stopped instead of deleting
export const cleanupOrphanedContainersInternal = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now()
		const containers = await ctx.db.query("containers").collect()
		const poolEntries = await ctx.db.query("containerPool").collect()

		// Get all active container IDs from the pool
		const activeContainerIds = new Set(poolEntries.map((p) => p.containerId))

		let updated = 0
		const updatedContainers: string[] = []

		for (const container of containers) {
			// Skip containers managed by Tailscale - they're handled by Tailscale sync
			if (container.tailscaleNodeId) {
				continue
			}

			// Skip containers that are actively registered in the pool
			if (activeContainerIds.has(container.containerId)) {
				continue
			}

			// Skip containers updated in the last 5 minutes (might be starting up)
			if (container.updatedAt && now - container.updatedAt < 5 * 60 * 1000) {
				continue
			}

			// Skip containers that are already stopped
			if (container.status === "stopped" || container.status === "exited") {
				continue
			}

			// This container is orphaned - mark as stopped (not deleted)
			// The Docker container may still exist on the host
			await ctx.db.patch(container._id, {
				status: "stopped",
				updatedAt: now,
			})
			updated++
			updatedContainers.push(container.name)
		}

		// For backwards compatibility, return 'deleted' as 0
		return { deleted: 0, updated, containers: updatedContainers }
	},
})

// Internal mutation to mark orphaned containers as stopped (not deleted)
// Called from Tailscale sync - containers may still exist on the host in stopped state
export const markOrphanedContainersStoppedInternal = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now()
		const containers = await ctx.db.query("containers").collect()
		const poolEntries = await ctx.db.query("containerPool").collect()

		// Get all active container IDs from the pool
		const activeContainerIds = new Set(poolEntries.map((p) => p.containerId))

		let updated = 0
		const updatedContainers: string[] = []

		for (const container of containers) {
			// Skip containers managed by Tailscale - they're handled separately
			if (container.tailscaleNodeId) {
				continue
			}

			// Skip containers that are actively registered in the pool
			if (activeContainerIds.has(container.containerId)) {
				continue
			}

			// Skip containers updated in the last 5 minutes (might be starting up)
			if (container.updatedAt && now - container.updatedAt < 5 * 60 * 1000) {
				continue
			}

			// Skip containers that are already stopped
			if (container.status === "stopped" || container.status === "exited") {
				continue
			}

			// This container is orphaned - mark as stopped
			await ctx.db.patch(container._id, {
				status: "stopped",
				updatedAt: now,
			})
			updated++
			updatedContainers.push(container.name)
		}

		return { updated, containers: updatedContainers }
	},
})

// =============================================================================
// Actions - For syncing containers with host
// =============================================================================

/**
 * Sync containers with the actual Docker host.
 * Sends a listContainers command to the gateway, waits for the result,
 * and removes any containers from the DB that don't exist on the host.
 */
export const syncWithHost = action({
	args: {
		server: v.string(),
		sshUser: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<{
		verified: number
		removed: number
		removedContainers: string[]
		updated: number
	}> => {
		// 1. Get all containers from DB for this host
		const allContainers = await ctx.runQuery(api.containers.list)
		const hostContainers = allContainers.filter(
			(c) =>
				c.serverHostname === args.server ||
				(!c.serverHostname && args.server === "localhost"),
		)

		if (hostContainers.length === 0) {
			return { verified: 0, removed: 0, removedContainers: [], updated: 0 }
		}

		// 2. Send listContainers command to gateway
		const commandId = await ctx.runMutation(api.serverCommands.listContainers, {
			server: args.server,
			sshUser: args.sshUser,
			priority: "high",
		})

		// 3. Poll for command completion (max 30 seconds)
		const maxWaitMs = 30000
		const pollIntervalMs = 500
		const startTime = Date.now()

		type ListContainersResult = {
			containers: Array<{ name: string; containerId: string; running: boolean }>
			server: string
		}

		let commandResult: ListContainersResult | null = null

		while (Date.now() - startTime < maxWaitMs) {
			const command = await ctx.runQuery(api.serverCommands.get, {
				id: commandId,
			})

			if (!command) {
				throw new Error("Command not found")
			}

			if (command.status === "completed" && command.result) {
				commandResult = command.result as ListContainersResult
				break
			}

			if (command.status === "failed") {
				throw new Error(command.error || "Failed to list containers on host")
			}

			// Wait before polling again
			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
		}

		if (!commandResult) {
			throw new Error("Timeout waiting for listContainers command")
		}

		// 4. Build a set of container names that exist on the host
		const actualContainers = commandResult.containers
		const hostContainerNames = new Set(actualContainers.map((c) => c.name))
		const hostContainerStatus = new Map(
			actualContainers.map((c) => [c.name, c.running] as const),
		)

		// 5. Compare and remove orphans, update status for existing containers
		let removed = 0
		let updated = 0
		const removedContainers: string[] = []

		for (const container of hostContainers) {
			// Check by name or tailscaleHostname
			const nameToCheck = container.tailscaleHostname || container.name
			const existsOnHost = hostContainerNames.has(nameToCheck)

			if (!existsOnHost) {
				// Container doesn't exist on host - remove from DB
				await ctx.runMutation(api.containers.deleteContainer, {
					id: container._id,
				})
				removed++
				removedContainers.push(container.name)
			} else {
				// Container exists - check if status needs updating
				const isRunningOnHost = hostContainerStatus.get(nameToCheck)
				const dbStatus = container.status
				const hostStatus = isRunningOnHost ? "running" : "stopped"

				if (dbStatus !== hostStatus) {
					await ctx.runMutation(api.containers.updateStatus, {
						id: container._id,
						status: hostStatus,
					})
					updated++
				}
			}
		}

		return {
			verified: hostContainers.length - removed,
			removed,
			removedContainers,
			updated,
		}
	},
})
