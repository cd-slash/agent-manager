import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import {
	commandPriorityValidator,
	containerCommandTypeValidator,
	gatewayCommandStatusValidator,
	taskPhaseValidator,
} from "./validators"

// Default retry configuration
const DEFAULT_MAX_RETRIES = 2
const OAUTH_MAX_RETRIES = 1

// Priority order for sorting (higher number = higher priority)
const PRIORITY_ORDER = {
	critical: 4,
	high: 3,
	normal: 2,
	low: 1,
} as const

// =============================================================================
// Container Command Mutations - Create commands for specific containers
// =============================================================================

/**
 * Start execution on a specific container
 */
export const startExecution = mutation({
	args: {
		containerId: v.string(),
		message: v.string(),
		model: v.optional(v.string()),
		provider: v.optional(v.string()),
		envVars: v.optional(v.object({
			ANTHROPIC_AUTH_TOKEN: v.optional(v.string()),
			ANTHROPIC_BASE_URL: v.optional(v.string()),
			API_TIMEOUT_MS: v.optional(v.string()),
		})),
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
		sessionId: v.optional(v.string()), // Claude session ID for resumption
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		const correlationId = crypto.randomUUID()

		const commandId = await ctx.db.insert("containerCommands", {
			containerId: args.containerId,
			type: "startExecution",
			status: "pending",
			priority: args.priority ?? "normal",
			payload: {
				message: args.message,
				model: args.model,
				provider: args.provider,
				envVars: args.envVars,
				workingDirectory: args.workingDirectory,
				permissionMode: args.permissionMode,
				systemPrompt: args.systemPrompt,
				appendSystemPrompt: args.appendSystemPrompt,
				allowedTools: args.allowedTools,
				disallowedTools: args.disallowedTools,
				maxBudget: args.maxBudget,
				sessionId: args.sessionId,
			},
			correlationId,
			taskId: args.taskId,
			projectId: args.projectId,
			retryCount: 0,
			maxRetries: DEFAULT_MAX_RETRIES,
			createdAt: now,
			updatedAt: now,
		})

		return { commandId, correlationId }
	},
})

/**
 * Abort an execution by correlation ID
 */
export const abortExecution = mutation({
	args: {
		containerId: v.string(),
		correlationId: v.string(),
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("containerCommands", {
			containerId: args.containerId,
			type: "abortExecution",
			status: "pending",
			priority: args.priority ?? "critical", // Aborts are always urgent
			payload: {
				correlationId: args.correlationId,
			},
			correlationId: args.correlationId,
			retryCount: 0,
			maxRetries: 1, // Only one attempt for aborts
			createdAt: now,
			updatedAt: now,
		})
	},
})

/**
 * Push auth token to a container
 */
export const pushAuthToken = mutation({
	args: {
		containerId: v.string(),
		token: v.string(),
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("containerCommands", {
			containerId: args.containerId,
			type: "pushAuthToken",
			status: "pending",
			priority: args.priority ?? "high",
			payload: {
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
 * Start phase execution on a container
 */
export const startPhaseExecution = mutation({
	args: {
		containerId: v.string(),
		taskId: v.string(),
		phase: taskPhaseValidator,
		customPrompt: v.optional(v.string()),
		configOverrides: v.optional(v.any()),
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		const correlationId = crypto.randomUUID()

		const commandId = await ctx.db.insert("containerCommands", {
			containerId: args.containerId,
			type: "startPhaseExecution",
			status: "pending",
			priority: args.priority ?? "normal",
			payload: {
				taskId: args.taskId,
				phase: args.phase,
				customPrompt: args.customPrompt,
				configOverrides: args.configOverrides,
			},
			correlationId,
			taskId: args.taskId,
			retryCount: 0,
			maxRetries: DEFAULT_MAX_RETRIES,
			createdAt: now,
			updatedAt: now,
		})

		return { commandId, correlationId }
	},
})

/**
 * Start OAuth flow on a container
 */
export const startOAuthFlow = mutation({
	args: {
		containerId: v.string(),
		provider: v.string(),
		oauthFlowId: v.string(),
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("containerCommands", {
			containerId: args.containerId,
			type: "startOAuthFlow",
			status: "pending",
			priority: args.priority ?? "high",
			payload: {
				provider: args.provider,
				oauthFlowId: args.oauthFlowId,
			},
			retryCount: 0,
			maxRetries: OAUTH_MAX_RETRIES,
			createdAt: now,
			updatedAt: now,
		})
	},
})

/**
 * Complete OAuth flow on a container
 */
export const completeOAuthFlow = mutation({
	args: {
		containerId: v.string(),
		oauthFlowId: v.string(),
		containerFlowId: v.string(), // Flow ID from the container's OAuth session
		authCode: v.string(),
		priority: v.optional(commandPriorityValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now()
		return await ctx.db.insert("containerCommands", {
			containerId: args.containerId,
			type: "completeOAuthFlow",
			status: "pending",
			priority: args.priority ?? "high",
			payload: {
				oauthFlowId: args.oauthFlowId,
				containerFlowId: args.containerFlowId,
				authCode: args.authCode,
			},
			retryCount: 0,
			maxRetries: OAUTH_MAX_RETRIES,
			createdAt: now,
			updatedAt: now,
		})
	},
})

// =============================================================================
// Queries - For containers to get their commands
// =============================================================================

/**
 * Get a specific command by ID
 */
export const get = query({
	args: { id: v.id("containerCommands") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id)
	},
})

/**
 * Get pending commands for a specific container
 * This is the main query containers subscribe to
 */
export const getForContainer = query({
	args: { containerId: v.string() },
	handler: async (ctx, args) => {
		const commands = await ctx.db
			.query("containerCommands")
			.withIndex("by_container_and_status", (q) =>
				q.eq("containerId", args.containerId).eq("status", "pending"),
			)
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
 * Get all active commands for a container (pending + processing)
 */
export const getActiveForContainer = query({
	args: { containerId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("containerCommands")
			.withIndex("by_container", (q) => q.eq("containerId", args.containerId))
			.filter((q) =>
				q.or(
					q.eq(q.field("status"), "pending"),
					q.eq(q.field("status"), "processing"),
				),
			)
			.collect()
	},
})

/**
 * Get command by correlation ID
 */
export const getByCorrelationId = query({
	args: { correlationId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("containerCommands")
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
			.query("containerCommands")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect()
	},
})

/**
 * Get all pending commands (for monitoring)
 */
export const getAllPending = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("containerCommands")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect()
	},
})

// =============================================================================
// Status Mutations - For containers to update command status
// =============================================================================

/**
 * Mark command as processing
 */
export const markProcessing = mutation({
	args: { id: v.id("containerCommands") },
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
 * Mark command as completed with result
 */
export const complete = mutation({
	args: {
		id: v.id("containerCommands"),
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
		id: v.id("containerCommands"),
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
