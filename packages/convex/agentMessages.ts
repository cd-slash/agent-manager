/**
 * Agent Messages - Structured Streaming Storage
 *
 * Stores streaming output from Claude Code CLI in a structured format
 * for rich display and analysis. Messages are parsed from raw JSON streams
 * into typed records with proper fields for tools, text, thinking, etc.
 */

import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { agentMessageTypeValidator } from "./validators"

// Types for raw streaming content
type RawStreamContent = {
	type?: string
	content?: Array<{
		type: string
		text?: string
		id?: string
		name?: string
		input?: unknown
	}>
	tool_use_id?: string
	is_error?: boolean
	content_block?: {
		type: string
		id?: string
		name?: string
	}
}

// =============================================================================
// Queries
// =============================================================================

/**
 * Get all messages for a session, ordered by sequence/timestamp
 */
export const getBySession = query({
	args: { sessionId: v.string() },
	handler: async (ctx, args) => {
		// Try to get by sequence first for ordered results
		const bySequence = await ctx.db
			.query("agentMessages")
			.withIndex("by_session_and_sequence", (q) =>
				q.eq("sessionId", args.sessionId),
			)
			.collect()

		// If we have sequence numbers, sort by them
		if (bySequence.some((m) => m.sequenceNumber !== undefined)) {
			return bySequence.sort(
				(a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0),
			)
		}

		// Fall back to timestamp ordering
		return await ctx.db
			.query("agentMessages")
			.withIndex("by_session_and_timestamp", (q) =>
				q.eq("sessionId", args.sessionId),
			)
			.collect()
	},
})

/**
 * Get messages for a session with pagination
 */
export const getBySessionPaginated = query({
	args: {
		sessionId: v.string(),
		limit: v.optional(v.number()),
		cursor: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50

		const result = await ctx.db
			.query("agentMessages")
			.withIndex("by_session_and_timestamp", (q) =>
				q.eq("sessionId", args.sessionId),
			)
			.paginate({ numItems: limit, cursor: args.cursor ?? null })

		return {
			messages: result.page,
			nextCursor: result.continueCursor,
			isDone: result.isDone,
		}
	},
})

/**
 * Get only tool-related messages (tool_use and tool_result)
 */
export const getToolCalls = query({
	args: { sessionId: v.string() },
	handler: async (ctx, args) => {
		const allMessages = await ctx.db
			.query("agentMessages")
			.withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
			.collect()

		// Filter for tool messages and sort by sequence/timestamp
		return allMessages
			.filter(
				(m) => m.messageType === "tool_use" || m.messageType === "tool_result",
			)
			.sort((a, b) => {
				if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
					return a.sequenceNumber - b.sequenceNumber
				}
				return a.timestamp - b.timestamp
			})
	},
})

/**
 * Get most recent messages for a session
 */
export const getLatest = query({
	args: {
		sessionId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 20

		const messages = await ctx.db
			.query("agentMessages")
			.withIndex("by_session_and_timestamp", (q) =>
				q.eq("sessionId", args.sessionId),
			)
			.order("desc")
			.take(limit)

		// Return in chronological order
		return messages.reverse()
	},
})

/**
 * Get messages filtered by type
 */
export const getByType = query({
	args: {
		sessionId: v.string(),
		messageType: agentMessageTypeValidator,
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("agentMessages")
			.withIndex("by_session_and_type", (q) =>
				q.eq("sessionId", args.sessionId).eq("messageType", args.messageType),
			)
			.collect()
	},
})

/**
 * Get message count for a session
 */
export const getCount = query({
	args: { sessionId: v.string() },
	handler: async (ctx, args) => {
		const messages = await ctx.db
			.query("agentMessages")
			.withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
			.collect()

		return messages.length
	},
})

/**
 * Get session summary (counts by type, latest activity)
 */
export const getSessionSummary = query({
	args: { sessionId: v.string() },
	handler: async (ctx, args) => {
		const messages = await ctx.db
			.query("agentMessages")
			.withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
			.collect()

		const summary = {
			totalMessages: messages.length,
			byType: {
				text: 0,
				tool_use: 0,
				tool_result: 0,
				thinking: 0,
				error: 0,
				system: 0,
				result: 0,
			} as Record<string, number>,
			toolsUsed: new Set<string>(),
			hasErrors: false,
			firstTimestamp: undefined as number | undefined,
			lastTimestamp: undefined as number | undefined,
		}

		for (const msg of messages) {
			// Count by type
			summary.byType[msg.messageType] =
				(summary.byType[msg.messageType] || 0) + 1

			// Track tools used
			if (msg.toolName) {
				summary.toolsUsed.add(msg.toolName)
			}

			// Check for errors
			if (msg.messageType === "error" || msg.isError) {
				summary.hasErrors = true
			}

			// Track timestamps
			if (!summary.firstTimestamp || msg.timestamp < summary.firstTimestamp) {
				summary.firstTimestamp = msg.timestamp
			}
			if (!summary.lastTimestamp || msg.timestamp > summary.lastTimestamp) {
				summary.lastTimestamp = msg.timestamp
			}
		}

		return {
			...summary,
			toolsUsed: Array.from(summary.toolsUsed),
		}
	},
})

// =============================================================================
// Mutations
// =============================================================================

/**
 * Create a new structured message
 * Parses raw streaming content into structured fields
 */
export const create = mutation({
	args: {
		sessionId: v.string(),
		streamType: v.optional(v.string()),
		content: v.any(), // Raw content from stream
		sequenceNumber: v.optional(v.number()),
		// Legacy support
		messageType: v.optional(v.string()),
		timestamp: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const now = args.timestamp ?? Date.now()
		const parsed = parseStreamContent(args.content, args.streamType)

		// Handle legacy messageType if provided
		let messageType = parsed.messageType
		if (args.messageType) {
			// Map old types to new types
			if (args.messageType === "assistant") {
				messageType = "text"
			} else if (
				args.messageType === "result" ||
				args.messageType === "system"
			) {
				messageType = args.messageType as "result" | "system"
			}
		}

		return await ctx.db.insert("agentMessages", {
			sessionId: args.sessionId,
			messageType,
			streamType: args.streamType,
			text: parsed.text,
			toolName: parsed.toolName,
			toolId: parsed.toolId,
			toolInput: parsed.toolInput,
			toolResult: parsed.toolResult,
			isError: parsed.isError,
			rawContent:
				typeof args.content === "string"
					? args.content
					: JSON.stringify(args.content),
			timestamp: now,
			sequenceNumber: args.sequenceNumber,
		})
	},
})

/**
 * Create multiple messages in a batch
 * More efficient for high-throughput streaming
 */
export const createBatch = mutation({
	args: {
		messages: v.array(
			v.object({
				sessionId: v.string(),
				streamType: v.optional(v.string()),
				content: v.any(),
				sequenceNumber: v.optional(v.number()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		const ids = []

		for (const [i, msg] of args.messages.entries()) {
			const parsed = parseStreamContent(msg.content, msg.streamType)

			const id = await ctx.db.insert("agentMessages", {
				sessionId: msg.sessionId,
				messageType: parsed.messageType,
				streamType: msg.streamType,
				text: parsed.text,
				toolName: parsed.toolName,
				toolId: parsed.toolId,
				toolInput: parsed.toolInput,
				toolResult: parsed.toolResult,
				isError: parsed.isError,
				rawContent:
					typeof msg.content === "string"
						? msg.content
						: JSON.stringify(msg.content),
				timestamp: now + i, // Ensure unique timestamps
				sequenceNumber: msg.sequenceNumber,
			})

			ids.push(id)
		}

		return { created: ids.length, ids }
	},
})

/**
 * Create a structured message directly (already parsed)
 * Use this when you've already parsed the content
 */
export const createStructured = mutation({
	args: {
		sessionId: v.string(),
		messageType: agentMessageTypeValidator,
		streamType: v.optional(v.string()),
		text: v.optional(v.string()),
		toolName: v.optional(v.string()),
		toolId: v.optional(v.string()),
		toolInput: v.optional(v.any()),
		toolResult: v.optional(v.any()),
		isError: v.optional(v.boolean()),
		rawContent: v.optional(v.string()),
		sequenceNumber: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("agentMessages", {
			sessionId: args.sessionId,
			messageType: args.messageType,
			streamType: args.streamType,
			text: args.text,
			toolName: args.toolName,
			toolId: args.toolId,
			toolInput: args.toolInput,
			toolResult: args.toolResult,
			isError: args.isError,
			rawContent: args.rawContent,
			timestamp: Date.now(),
			sequenceNumber: args.sequenceNumber,
		})
	},
})

/**
 * Delete all messages for a session
 * Use for cleanup after session completion
 */
export const deleteBySession = mutation({
	args: { sessionId: v.string() },
	handler: async (ctx, args) => {
		const messages = await ctx.db
			.query("agentMessages")
			.withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
			.collect()

		for (const msg of messages) {
			await ctx.db.delete(msg._id)
		}

		return { deleted: messages.length }
	},
})

/**
 * Delete old messages (cleanup)
 * Removes messages older than specified milliseconds
 */
export const cleanupOld = mutation({
	args: { olderThanMs: v.number() },
	handler: async (ctx, args) => {
		const cutoff = Date.now() - args.olderThanMs

		// Get all sessions that might have old messages
		const allMessages = await ctx.db.query("agentMessages").collect()

		let deleted = 0
		for (const msg of allMessages) {
			if (msg.timestamp < cutoff) {
				await ctx.db.delete(msg._id)
				deleted++
			}
		}

		return { deleted }
	},
})

// =============================================================================
// Helper Functions
// =============================================================================

type ParsedContent = {
	messageType:
		| "text"
		| "tool_use"
		| "tool_result"
		| "thinking"
		| "error"
		| "system"
		| "result"
	text?: string
	toolName?: string
	toolId?: string
	toolInput?: unknown
	toolResult?: unknown
	isError?: boolean
}

/**
 * Parse raw stream content into structured fields
 */
function parseStreamContent(
	content: unknown,
	streamType?: string,
): ParsedContent {
	// Handle string content
	if (typeof content === "string") {
		// Try to parse as JSON
		try {
			const parsed = JSON.parse(content) as unknown
			return parseStreamContent(parsed, streamType)
		} catch {
			// Plain text
			return {
				messageType: streamType === "result" ? "result" : "text",
				text: content,
			}
		}
	}

	// Handle object content
	if (content && typeof content === "object") {
		const obj = content as RawStreamContent

		// Check for tool_use
		if (obj.type === "tool_use" || obj.content_block?.type === "tool_use") {
			return {
				messageType: "tool_use",
				toolId: obj.content_block?.id,
				toolName: obj.content_block?.name,
				toolInput: undefined, // Input comes in delta events
			}
		}

		// Check for tool_result
		if (obj.type === "tool_result") {
			return {
				messageType: "tool_result",
				toolId: obj.tool_use_id,
				toolResult: obj.content,
				isError: obj.is_error,
			}
		}

		// Check for content array
		if (Array.isArray(obj.content)) {
			// Extract text from content blocks
			const textBlocks = obj.content.filter(
				(c): c is { type: "text"; text: string } =>
					c.type === "text" && typeof c.text === "string",
			)
			if (textBlocks.length > 0) {
				return {
					messageType: "text",
					text: textBlocks.map((b) => b.text).join(""),
				}
			}

			// Extract tool_use from content blocks
			const toolBlocks = obj.content.filter(
				(
					c,
				): c is {
					type: "tool_use"
					id: string
					name: string
					input: unknown
				} => c.type === "tool_use",
			)
			const tool = toolBlocks[0]
			if (tool) {
				return {
					messageType: "tool_use",
					toolId: tool.id,
					toolName: tool.name,
					toolInput: tool.input,
				}
			}
		}

		// Check stream type hints
		if (streamType === "result") {
			return {
				messageType: "result",
				text: typeof obj === "object" ? JSON.stringify(obj) : String(obj),
			}
		}

		if (streamType === "system") {
			return {
				messageType: "system",
				text: typeof obj === "object" ? JSON.stringify(obj) : String(obj),
			}
		}
	}

	// Default to text
	return {
		messageType: "text",
		text: typeof content === "string" ? content : JSON.stringify(content),
	}
}
