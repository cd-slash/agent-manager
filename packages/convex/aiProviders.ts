import { v } from "convex/values"
import { api } from "./_generated/api"
import { action, internalMutation, mutation, query } from "./_generated/server"
import { aiProviderTypeValidator, authTypeValidator } from "./validators"

// Type definitions
type AiProviderType = "opencode" | "custom"
type AuthType = "api_key"

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
	options?: Record<string, unknown>
	models: AiModelConfig[]
}

// Built-in providers that ship with the system
export const BUILTIN_PROVIDERS: BuiltinProvider[] = [
	{
		name: "OpenCode",
		type: "opencode",
		enabled: true,
		authType: "api_key",
		apiKeySecretKey: "OPENCODE_API_KEY",
		models: [],
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
		options: v.optional(v.any()),
		models: v.array(modelConfigValidator),
	},
	handler: async (ctx, args) => {
		const { name, type, enabled, authType, apiKeySecretKey, options, models } =
			args

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
			options,
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
		options: v.optional(v.any()),
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

// Replace provider models from OpenCode listing
export const syncModels = mutation({
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

// Fetch models from OpenCode server and sync provider list
export const fetchOpencodeModels = action({
	args: { providerId: v.id("aiProviders") },
	handler: async (ctx, args) => {
		const provider = await ctx.runQuery(api.aiProviders.get, {
			id: args.providerId,
		})
		if (!provider) {
			throw new Error("Provider not found")
		}

		const baseUrl =
			typeof provider.options?.baseURL === "string"
				? provider.options.baseURL
				: "http://localhost:4097"

		const response = await fetch(`${baseUrl.replace(/\/$/, "")}/zen/v1/models`)
		if (!response.ok) {
			throw new Error(`OpenCode models failed: ${response.statusText}`)
		}

		const data = (await response.json()) as unknown
		const rawModels = Array.isArray(data)
			? (data as Array<{ id: string; name?: string }>)
			: Array.isArray((data as { models?: unknown }).models)
				? (data as { models: Array<{ id: string; name?: string }> }).models
				: []

		if (rawModels.length === 0) {
			throw new Error("OpenCode returned no models")
		}

		const existing = provider.models ?? []
		const models = rawModels.map((model) => {
			const existingModel = existing.find((m) => m.id === model.id)
			return {
				id: model.id,
				name: model.name || model.id,
				enabled: existingModel?.enabled ?? true,
			}
		})

		await ctx.runMutation(api.aiProviders.syncModels, {
			id: provider._id,
			models,
		})

		return { count: models.length }
	},
})

// Replace provider options (e.g., baseURL, headers)
export const updateOptions = mutation({
	args: {
		id: v.id("aiProviders"),
		options: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const provider = await ctx.db.get(args.id)
		if (!provider) {
			throw new Error("Provider not found")
		}

		await ctx.db.patch(args.id, {
			options: args.options,
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
					options: provider.options,
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
