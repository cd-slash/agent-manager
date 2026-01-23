import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

// Build phase definitions with order
const BUILD_PHASES = [
	{ phase: "pending", order: 0 },
	{ phase: "building_binary", order: 1 },
	{ phase: "building_image", order: 2 },
	{ phase: "starting_container", order: 3 },
	{ phase: "deploying_binary", order: 4 },
	{ phase: "starting_daemon", order: 5 },
	{ phase: "ready", order: 6 },
] as const

const _phaseStatusValidator = v.union(
	v.literal("pending"),
	v.literal("in_progress"),
	v.literal("completed"),
	v.literal("failed"),
	v.literal("skipped"),
)

const buildStatusValidator = v.union(
	v.literal("pending"),
	v.literal("in_progress"),
	v.literal("completed"),
	v.literal("failed"),
)

// Create a new build with all phases initialized to "pending"
export const create = mutation({
	args: {
		containerId: v.string(),
		repo: v.string(),
		branch: v.string(),
		server: v.string(),
		taskId: v.optional(v.id("tasks")),
		projectId: v.optional(v.id("projects")),
	},
	handler: async (ctx, args) => {
		const now = Date.now()

		// Create the build record
		const buildId = await ctx.db.insert("containerBuilds", {
			containerId: args.containerId,
			repo: args.repo,
			branch: args.branch,
			server: args.server,
			currentPhase: "pending",
			status: "pending",
			taskId: args.taskId,
			projectId: args.projectId,
			startedAt: now,
		})

		// Create all phase records
		for (const { phase, order } of BUILD_PHASES) {
			await ctx.db.insert("containerBuildPhases", {
				containerId: args.containerId,
				phase,
				status: "pending",
				order,
			})
		}

		return buildId
	},
})

// Start a phase - mark it as "in_progress" and update currentPhase
export const startPhase = mutation({
	args: {
		containerId: v.string(),
		phase: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now()

		// Update the build's currentPhase and status
		const build = await ctx.db
			.query("containerBuilds")
			.withIndex("by_container", (q) => q.eq("containerId", args.containerId))
			.first()

		if (!build) {
			throw new Error(`Build not found for container: ${args.containerId}`)
		}

		await ctx.db.patch(build._id, {
			currentPhase: args.phase,
			status: "in_progress",
		})

		// Update the phase record
		const phaseRecord = await ctx.db
			.query("containerBuildPhases")
			.withIndex("by_container", (q) => q.eq("containerId", args.containerId))
			.filter((q) => q.eq(q.field("phase"), args.phase))
			.first()

		if (phaseRecord) {
			await ctx.db.patch(phaseRecord._id, {
				status: "in_progress",
				startedAt: now,
			})
		}

		return build._id
	},
})

// Complete a phase - mark it as "completed" with optional logs
export const completePhase = mutation({
	args: {
		containerId: v.string(),
		phase: v.string(),
		logs: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now()

		// Find and update the phase record
		const phaseRecord = await ctx.db
			.query("containerBuildPhases")
			.withIndex("by_container", (q) => q.eq("containerId", args.containerId))
			.filter((q) => q.eq(q.field("phase"), args.phase))
			.first()

		if (phaseRecord) {
			await ctx.db.patch(phaseRecord._id, {
				status: "completed",
				logs: args.logs,
				completedAt: now,
			})
		}

		// Check if this is the "ready" phase - if so, mark build as completed
		if (args.phase === "ready") {
			const build = await ctx.db
				.query("containerBuilds")
				.withIndex("by_container", (q) => q.eq("containerId", args.containerId))
				.first()

			if (build) {
				await ctx.db.patch(build._id, {
					status: "completed",
					completedAt: now,
				})
			}
		}

		return phaseRecord?._id
	},
})

// Fail a build - mark the phase and build as "failed"
export const failBuild = mutation({
	args: {
		containerId: v.string(),
		phase: v.string(),
		error: v.string(),
		logs: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now()

		// Update the phase record
		const phaseRecord = await ctx.db
			.query("containerBuildPhases")
			.withIndex("by_container", (q) => q.eq("containerId", args.containerId))
			.filter((q) => q.eq(q.field("phase"), args.phase))
			.first()

		if (phaseRecord) {
			await ctx.db.patch(phaseRecord._id, {
				status: "failed",
				error: args.error,
				logs: args.logs,
				completedAt: now,
			})
		}

		// Update the build record
		const build = await ctx.db
			.query("containerBuilds")
			.withIndex("by_container", (q) => q.eq("containerId", args.containerId))
			.first()

		if (build) {
			await ctx.db.patch(build._id, {
				status: "failed",
				error: args.error,
				completedAt: now,
			})
		}

		return build?._id
	},
})

// Append logs to the current phase
export const appendLogs = mutation({
	args: {
		containerId: v.string(),
		phase: v.string(),
		logs: v.string(),
	},
	handler: async (ctx, args) => {
		const phaseRecord = await ctx.db
			.query("containerBuildPhases")
			.withIndex("by_container", (q) => q.eq("containerId", args.containerId))
			.filter((q) => q.eq(q.field("phase"), args.phase))
			.first()

		if (phaseRecord) {
			const existingLogs = phaseRecord.logs || ""
			await ctx.db.patch(phaseRecord._id, {
				logs: existingLogs + args.logs,
			})
		}

		return phaseRecord?._id
	},
})

// Skip a phase (for phases that aren't needed)
export const skipPhase = mutation({
	args: {
		containerId: v.string(),
		phase: v.string(),
	},
	handler: async (ctx, args) => {
		const phaseRecord = await ctx.db
			.query("containerBuildPhases")
			.withIndex("by_container", (q) => q.eq("containerId", args.containerId))
			.filter((q) => q.eq(q.field("phase"), args.phase))
			.first()

		if (phaseRecord) {
			await ctx.db.patch(phaseRecord._id, {
				status: "skipped",
			})
		}

		return phaseRecord?._id
	},
})

// Get build by container ID
export const getByContainer = query({
	args: { containerId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("containerBuilds")
			.withIndex("by_container", (q) => q.eq("containerId", args.containerId))
			.first()
	},
})

// Get all phases for a container
export const getPhases = query({
	args: { containerId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("containerBuildPhases")
			.withIndex("by_container_and_order", (q) =>
				q.eq("containerId", args.containerId),
			)
			.collect()
	},
})

// List recent builds
export const listRecent = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50
		return await ctx.db.query("containerBuilds").order("desc").take(limit)
	},
})

// List builds by status
export const listByStatus = query({
	args: { status: buildStatusValidator },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("containerBuilds")
			.withIndex("by_status", (q) => q.eq("status", args.status))
			.collect()
	},
})

// List active builds (pending or in_progress)
export const listActive = query({
	args: {},
	handler: async (ctx) => {
		const pending = await ctx.db
			.query("containerBuilds")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect()

		const inProgress = await ctx.db
			.query("containerBuilds")
			.withIndex("by_status", (q) => q.eq("status", "in_progress"))
			.collect()

		return [...pending, ...inProgress].sort((a, b) => b.startedAt - a.startedAt)
	},
})
