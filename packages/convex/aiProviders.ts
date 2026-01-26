import { v } from "convex/values"
import { internalMutation, mutation, query } from "./_generated/server"
import { aiProviderTypeValidator, authTypeValidator } from "./validators"

// Type definitions
type AiProviderType = "anthropic" | "openai" | "google" | "zai" | "custom"
type AuthType = "api_key" | "oauth"

interface AiModelConfig {
	id: string
	name: string
	enabled: boolean
}

interface BuiltinProvider {
	name: string
	type: AiProviderType
	enabled: boolean
	authType: AuthType
	apiKeySecretKey?: string
	models: AiModelConfig[]
}

// Built-in providers that ship with the system
export const BUILTIN_PROVIDERS: BuiltinProvider[] = [
	{
		name: "Anthropic",
		type: "anthropic",
		enabled: true,
		authType: "oauth",
		models: [
			{ id: "opus", name: "Opus", enabled: true },
			{ id: "sonnet", name: "Sonnet", enabled: true },
			{ id: "haiku", name: "Haiku", enabled: true },
		],
	},
	{
		name: "ZAI",
		type: "zai",
		enabled: false,
		authType: "api_key",
		apiKeySecretKey: "ZAI_API_KEY",
		models: [
			{ id: "opus", name: "Opus", enabled: true },
			{ id: "sonnet", name: "Sonnet", enabled: true },
			{ id: "haiku", name: "Haiku", enabled: true },
		],
	},
]

// Model config validator for args
const modelConfigValidator = v.object({
	id: v.string(),
	name: v.string(),
	enabled: v.boolean(),
})

// =============================================================================
// Queries
// =============================================================================

// Get all providers
export const list = query({
	args: {},
	handler: async (ctx) => {
		const providers = await ctx.db.query("aiProviders").collect()
		return providers.sort((a, b) => {
			// Put enabled first, then sort by name
			if (a.enabled && !b.enabled) return -1
			if (!a.enabled && b.enabled) return 1
			return a.name.localeCompare(b.name)
		})
	},
})

// Get a specific provider by ID
export const get = query({
	args: { id: v.id("aiProviders") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id)
	},
})

// Get only enabled providers
export const getEnabled = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("aiProviders")
			.withIndex("by_enabled", (q) => q.eq("enabled", true))
			.collect()
	},
})

// Get a flat list of enabled models for selects
export const getEnabledModels = query({
	args: {},
	handler: async (ctx) => {
		const providers = await ctx.db
			.query("aiProviders")
			.withIndex("by_enabled", (q) => q.eq("enabled", true))
			.collect()

		const models: Array<{
			id: string
			name: string
			providerId: string
			providerName: string
			providerType: AiProviderType
		}> = []

		for (const provider of providers) {
			for (const model of provider.models) {
				if (model.enabled) {
					models.push({
						id: model.id,
						name: model.name,
						providerId: provider._id,
						providerName: provider.name,
						providerType: provider.type as AiProviderType,
					})
				}
			}
		}

		return models
	},
})

// Get models grouped by provider for grouped selects
export const getEnabledModelsGrouped = query({
	args: {},
	handler: async (ctx) => {
		const providers = await ctx.db
			.query("aiProviders")
			.withIndex("by_enabled", (q) => q.eq("enabled", true))
			.collect()

		const groups: Array<{
			providerId: string
			providerName: string
			providerType: AiProviderType
			models: Array<{ id: string; name: string }>
		}> = []

		for (const provider of providers) {
			const enabledModels = provider.models.filter((m) => m.enabled)
			if (enabledModels.length > 0) {
				groups.push({
					providerId: provider._id,
					providerName: provider.name,
					providerType: provider.type as AiProviderType,
					models: enabledModels.map((m) => ({ id: m.id, name: m.name })),
				})
			}
		}

		return groups
	},
})

// Get provider by type (useful for built-in providers)
export const getByType = query({
	args: { type: aiProviderTypeValidator },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("aiProviders")
			.withIndex("by_type", (q) => q.eq("type", args.type))
			.first()
	},
})

// Get auth status for a provider
// For OAuth providers, checks ANTHROPIC_AUTH_TOKEN secret
// For API key providers, checks the corresponding secret
export const getAuthStatus = query({
	args: { id: v.id("aiProviders") },
	handler: async (ctx, args) => {
		const provider = await ctx.db.get(args.id)
		if (!provider) {
			return { hasAuth: false, error: "Provider not found" }
		}

		if (provider.authType === "oauth") {
			// For OAuth providers, check the ANTHROPIC_AUTH_TOKEN secret
			const secret = await ctx.db
				.query("secrets")
				.withIndex("by_key", (q) => q.eq("key", "ANTHROPIC_AUTH_TOKEN"))
				.first()
			return { hasAuth: !!secret?.value }
		}

		// For API key providers, check the configured secret
		if (provider.apiKeySecretKey) {
			const secretKey = provider.apiKeySecretKey
			const secret = await ctx.db
				.query("secrets")
				.withIndex("by_key", (q) => q.eq("key", secretKey))
				.first()
			return { hasAuth: !!secret?.value }
		}

		return { hasAuth: false }
	},
})

// =============================================================================
// Mutations
// =============================================================================

// Create a new provider (usually for custom providers)
export const create = mutation({
	args: {
		name: v.string(),
		type: aiProviderTypeValidator,
		enabled: v.boolean(),
		authType: authTypeValidator,
		apiKeySecretKey: v.optional(v.string()),
		models: v.array(modelConfigValidator),
	},
	handler: async (ctx, args) => {
		const { name, type, enabled, authType, apiKeySecretKey, models } = args

		// Check for duplicate name
		const existing = await ctx.db.query("aiProviders").collect()
		const duplicate = existing.find(
			(p) => p.name.toLowerCase() === name.toLowerCase(),
		)
		if (duplicate) {
			throw new Error(`Provider with name "${name}" already exists`)
		}

		// Validate models array
		if (models.length === 0) {
			throw new Error("Provider must have at least one model")
		}

		const now = Date.now()
		return await ctx.db.insert("aiProviders", {
			name,
			type,
			enabled,
			authType,
			apiKeySecretKey,
			models,
			isBuiltin: false,
			createdAt: now,
			updatedAt: now,
		})
	},
})

// Update a provider
export const update = mutation({
	args: {
		id: v.id("aiProviders"),
		name: v.optional(v.string()),
		enabled: v.optional(v.boolean()),
		apiKeySecretKey: v.optional(v.string()),
		models: v.optional(v.array(modelConfigValidator)),
	},
	handler: async (ctx, args) => {
		const { id, ...updates } = args

		const provider = await ctx.db.get(id)
		if (!provider) {
			throw new Error("Provider not found")
		}

		// Don't allow changing name of built-in providers
		if (provider.isBuiltin && updates.name && updates.name !== provider.name) {
			throw new Error("Cannot change name of built-in providers")
		}

		// Check for duplicate name if changing name
		if (updates.name && updates.name !== provider.name) {
			const newName = updates.name
			const existing = await ctx.db.query("aiProviders").collect()
			const duplicate = existing.find(
				(p) => p._id !== id && p.name.toLowerCase() === newName.toLowerCase(),
			)
			if (duplicate) {
				throw new Error(`Provider with name "${newName}" already exists`)
			}
		}

		// Validate models if provided
		if (updates.models && updates.models.length === 0) {
			throw new Error("Provider must have at least one model")
		}

		await ctx.db.patch(id, {
			...updates,
			updatedAt: Date.now(),
		})

		return id
	},
})

// Remove a provider
export const remove = mutation({
	args: { id: v.id("aiProviders") },
	handler: async (ctx, args) => {
		const provider = await ctx.db.get(args.id)
		if (!provider) {
			throw new Error("Provider not found")
		}

		// Don't allow deleting built-in providers
		if (provider.isBuiltin) {
			throw new Error("Cannot delete built-in providers")
		}

		await ctx.db.delete(args.id)
	},
})

// Quick enable/disable toggle for a provider
export const toggleEnabled = mutation({
	args: { id: v.id("aiProviders") },
	handler: async (ctx, args) => {
		const provider = await ctx.db.get(args.id)
		if (!provider) {
			throw new Error("Provider not found")
		}

		await ctx.db.patch(args.id, {
			enabled: !provider.enabled,
			updatedAt: Date.now(),
		})

		return !provider.enabled
	},
})

// Enable/disable a specific model within a provider
export const toggleModelEnabled = mutation({
	args: {
		providerId: v.id("aiProviders"),
		modelId: v.string(),
	},
	handler: async (ctx, args) => {
		const provider = await ctx.db.get(args.providerId)
		if (!provider) {
			throw new Error("Provider not found")
		}

		const modelIndex = provider.models.findIndex((m) => m.id === args.modelId)
		if (modelIndex === -1) {
			throw new Error("Model not found in provider")
		}

		const existingModel = provider.models[modelIndex]
		if (!existingModel) {
			throw new Error("Model not found in provider")
		}

		const updatedModels = provider.models.map((m, i) =>
			i === modelIndex ? { ...m, enabled: !m.enabled } : m,
		)

		await ctx.db.patch(args.providerId, {
			models: updatedModels,
			updatedAt: Date.now(),
		})

		return !existingModel.enabled
	},
})

// Update models for a provider
export const updateModels = mutation({
	args: {
		id: v.id("aiProviders"),
		models: v.array(modelConfigValidator),
	},
	handler: async (ctx, args) => {
		const provider = await ctx.db.get(args.id)
		if (!provider) {
			throw new Error("Provider not found")
		}

		if (args.models.length === 0) {
			throw new Error("Provider must have at least one model")
		}

		await ctx.db.patch(args.id, {
			models: args.models,
			updatedAt: Date.now(),
		})

		return args.id
	},
})

// =============================================================================
// Initialization
// =============================================================================

// Initialize built-in providers (run once on setup)
export const seedBuiltinProviders = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now()
		const created: string[] = []
		const updated: string[] = []

		for (const provider of BUILTIN_PROVIDERS) {
			// Check if provider already exists by type
			const existing = await ctx.db
				.query("aiProviders")
				.withIndex("by_type", (q) => q.eq("type", provider.type))
				.first()

			if (!existing) {
				await ctx.db.insert("aiProviders", {
					name: provider.name,
					type: provider.type,
					enabled: provider.enabled,
					authType: provider.authType,
					apiKeySecretKey: provider.apiKeySecretKey,
					models: provider.models,
					isBuiltin: true,
					createdAt: now,
					updatedAt: now,
				})
				created.push(provider.name)
			} else if (existing.isBuiltin) {
				// Update built-in providers - replace models with canonical list
				const modelsMatch =
					JSON.stringify(existing.models.map((m) => m.id).sort()) ===
					JSON.stringify(provider.models.map((m) => m.id).sort())

				if (!modelsMatch) {
					await ctx.db.patch(existing._id, {
						models: provider.models,
						updatedAt: now,
					})
					updated.push(provider.name)
				}
			}
		}

		return { created, updated }
	},
})

// Check if providers have been seeded
export const hasBeenSeeded = query({
	args: {},
	handler: async (ctx) => {
		const count = await ctx.db.query("aiProviders").collect()
		return count.length > 0
	},
})

// =============================================================================
// OAuth Flow Management (Convex-driven, gateway pulls work)
// =============================================================================

// Frontend calls this to request an OAuth flow
// Gateway will pick it up and process it
export const requestOAuthFlow = mutation({
	args: {
		provider: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now()

		// Cancel any existing pending flows for this provider
		const existingFlows = await ctx.db
			.query("oauthFlows")
			.withIndex("by_provider_and_status", (q) =>
				q.eq("provider", args.provider).eq("status", "pending"),
			)
			.collect()

		for (const flow of existingFlows) {
			await ctx.db.patch(flow._id, {
				status: "failed",
				error: "Cancelled - new flow started",
				updatedAt: now,
			})
		}

		// Create new pending flow
		const id = await ctx.db.insert("oauthFlows", {
			provider: args.provider,
			status: "pending",
			createdAt: now,
			updatedAt: now,
		})

		return id
	},
})

// Get the current OAuth flow for a provider
export const getActiveOAuthFlow = query({
	args: {
		provider: v.string(),
	},
	handler: async (ctx, args) => {
		// Get the most recent non-failed flow
		const flows = await ctx.db
			.query("oauthFlows")
			.withIndex("by_provider_and_status", (q) =>
				q.eq("provider", args.provider),
			)
			.order("desc")
			.take(10)

		// Find the most recent active flow
		const activeFlow = flows.find(
			(f) =>
				f.status === "pending" ||
				f.status === "started" ||
				f.status === "code_received" ||
				f.status === "completing",
		)

		return activeFlow ?? null
	},
})

// Frontend calls this to submit the auth code
export const submitOAuthCode = mutation({
	args: {
		flowId: v.id("oauthFlows"),
		code: v.string(),
	},
	handler: async (ctx, args) => {
		const flow = await ctx.db.get(args.flowId)
		if (!flow) {
			throw new Error("OAuth flow not found")
		}

		if (flow.status !== "started") {
			throw new Error(`Cannot submit code for flow in status: ${flow.status}`)
		}

		await ctx.db.patch(args.flowId, {
			status: "code_received",
			authCode: args.code,
			updatedAt: Date.now(),
		})
	},
})

// Cancel an OAuth flow
export const cancelOAuthFlow = mutation({
	args: {
		flowId: v.id("oauthFlows"),
	},
	handler: async (ctx, args) => {
		const flow = await ctx.db.get(args.flowId)
		if (!flow) return

		await ctx.db.patch(args.flowId, {
			status: "failed",
			error: "Cancelled by user",
			updatedAt: Date.now(),
		})
	},
})

// =============================================================================
// Gateway mutations for OAuth flow updates (called via HTTP API)
// =============================================================================

// Gateway calls this when it starts the OAuth flow
export const updateOAuthFlowStarted = mutation({
	args: {
		flowId: v.id("oauthFlows"),
		oauthUrl: v.string(),
		gatewayFlowId: v.string(),
		expiresAt: v.number(),
	},
	handler: async (ctx, args) => {
		const flow = await ctx.db.get(args.flowId)
		if (!flow) {
			throw new Error("OAuth flow not found")
		}

		await ctx.db.patch(args.flowId, {
			status: "started",
			oauthUrl: args.oauthUrl,
			flowId: args.gatewayFlowId,
			expiresAt: args.expiresAt,
			updatedAt: Date.now(),
		})
	},
})

// Gateway calls this when completing the OAuth exchange
export const updateOAuthFlowCompleting = mutation({
	args: {
		flowId: v.id("oauthFlows"),
	},
	handler: async (ctx, args) => {
		const flow = await ctx.db.get(args.flowId)
		if (!flow) {
			throw new Error("OAuth flow not found")
		}

		await ctx.db.patch(args.flowId, {
			status: "completing",
			updatedAt: Date.now(),
		})
	},
})

// Gateway calls this when OAuth completes successfully
export const completeOAuthFlowSuccess = mutation({
	args: {
		flowId: v.id("oauthFlows"),
	},
	handler: async (ctx, args) => {
		const flow = await ctx.db.get(args.flowId)
		if (!flow) {
			throw new Error("OAuth flow not found")
		}

		await ctx.db.patch(args.flowId, {
			status: "completed",
			authCode: undefined, // Clear the code
			updatedAt: Date.now(),
		})
	},
})

// Gateway calls this when OAuth fails
export const completeOAuthFlowFailure = mutation({
	args: {
		flowId: v.id("oauthFlows"),
		error: v.string(),
	},
	handler: async (ctx, args) => {
		const flow = await ctx.db.get(args.flowId)
		if (!flow) {
			throw new Error("OAuth flow not found")
		}

		await ctx.db.patch(args.flowId, {
			status: "failed",
			error: args.error,
			updatedAt: Date.now(),
		})
	},
})

// Query for gateway to get pending flows
export const getPendingOAuthFlows = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("oauthFlows")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect()
	},
})

// Query for gateway to get flows with submitted codes
export const getOAuthFlowsWithCodes = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("oauthFlows")
			.withIndex("by_status", (q) => q.eq("status", "code_received"))
			.collect()
	},
})
