import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const record = mutation({
	args: {
		taskId: v.optional(v.id("tasks")),
		containerId: v.optional(v.id("containers")),
		containerName: v.string(),
		server: v.string(),
		cwd: v.optional(v.string()),
		type: v.union(v.literal("working"), v.literal("staged")),
		diff: v.string(),
		lineCount: v.optional(v.number()),
		byteCount: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("containerDiffs", {
			taskId: args.taskId,
			containerId: args.containerId,
			containerName: args.containerName,
			server: args.server,
			cwd: args.cwd,
			type: args.type,
			diff: args.diff,
			lineCount: args.lineCount,
			byteCount: args.byteCount,
			createdAt: now,
		})
	},
})

export const getLatestByTask = query({
	args: {
		taskId: v.id("tasks"),
		type: v.union(v.literal("working"), v.literal("staged")),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("containerDiffs")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.filter((q) => q.eq(q.field("type"), args.type))
			.order("desc")
			.first()
	},
})

export const listByTask = query({
	args: { taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("containerDiffs")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.order("desc")
			.collect()
	},
})

export const clearByTask = mutation({
	args: {
		taskId: v.id("tasks"),
		type: v.optional(v.union(v.literal("working"), v.literal("staged"))),
	},
	handler: async (ctx, args) => {
		let query = ctx.db
			.query("containerDiffs")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))

		if (args.type) {
			query = query.filter((q) => q.eq(q.field("type"), args.type))
		}

		const snapshots = await query.collect()
		for (const snapshot of snapshots) {
			await ctx.db.delete(snapshot._id)
		}

		return { deleted: snapshots.length }
	},
})

export const listByTaskPaginated = query({
	args: {
		taskId: v.id("tasks"),
		limit: v.optional(v.number()),
		cursor: v.optional(v.string()),
		containerName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 20
		let query = ctx.db
			.query("containerDiffs")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.order("desc")

		if (args.containerName) {
			query = query.filter((q) =>
				q.eq(q.field("containerName"), args.containerName),
			)
		}

		const result = await query.paginate({
			numItems: limit,
			cursor: args.cursor ?? null,
		})

		return {
			items: result.page,
			nextCursor: result.continueCursor,
			isDone: result.isDone,
		}
	},
})
