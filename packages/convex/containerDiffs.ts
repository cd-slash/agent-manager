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
