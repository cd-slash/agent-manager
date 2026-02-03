import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const record = mutation({
	args: {
		sessionId: v.string(),
		messageId: v.optional(v.string()),
		diffs: v.any(),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("opencodeSessionDiffs", {
			sessionId: args.sessionId,
			messageId: args.messageId,
			diffs: args.diffs,
			createdAt: now,
		})
	},
})

export const getBySession = query({
	args: { sessionId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("opencodeSessionDiffs")
			.withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
			.order("desc")
			.collect()
	},
})

export const getBySessionAndMessage = query({
	args: { sessionId: v.string(), messageId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("opencodeSessionDiffs")
			.withIndex("by_session_and_message", (q) =>
				q.eq("sessionId", args.sessionId).eq("messageId", args.messageId),
			)
			.order("desc")
			.first()
	},
})

export const getByTask = query({
	args: { taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const sessions = await ctx.db
			.query("agentSessions")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect()

		if (sessions.length === 0) {
			return []
		}

		const opencodeSessionIds = sessions
			.map((session) => session.opencodeSessionId)
			.filter((id): id is string => typeof id === "string")

		const results: Array<{
			sessionId: string
			messageId?: string
			diffs: unknown
			createdAt: number
			agentSessionId: string
			startedAt?: number
			status?: string
		}> = []

		const sessionByOpencode = new Map(
			sessions
				.filter((session) => session.opencodeSessionId)
				.map((session) => [session.opencodeSessionId as string, session]),
		)

		for (const opencodeSessionId of opencodeSessionIds) {
			const diffs = await ctx.db
				.query("opencodeSessionDiffs")
				.withIndex("by_session", (q) => q.eq("sessionId", opencodeSessionId))
				.collect()

			const agentSession = sessionByOpencode.get(opencodeSessionId)
			for (const diff of diffs) {
				results.push({
					sessionId: diff.sessionId,
					messageId: diff.messageId,
					diffs: diff.diffs,
					createdAt: diff.createdAt,
					agentSessionId: agentSession?.sessionId || diff.sessionId,
					startedAt: agentSession?.startedAt,
					status: agentSession?.status,
				})
			}
		}

		return results.sort((a, b) => b.createdAt - a.createdAt)
	},
})
