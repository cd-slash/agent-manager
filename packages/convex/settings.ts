import { v } from "convex/values"
import { internalQuery, mutation, query } from "./_generated/server"

// Get a setting by key
export const get = query({
	args: { key: v.string() },
	handler: async (ctx, args) => {
		const setting = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.first()
		return setting
	},
})

// Get Tailscale config (returns masked data for security - for frontend)
export const getTailscaleConfig = query({
	args: {},
	handler: async (ctx) => {
		const setting = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", "tailscale"))
			.first()

		if (!setting) {
			return {
				tailnetId: null,
				hasApiKey: false,
				hasWebhookSecret: false,
				lastValidated: null,
			}
		}

		const value = setting.value as {
			tailnetId?: string
			apiKey?: string
			webhookSecret?: string
		}
		return {
			tailnetId: value.tailnetId ?? null,
			hasApiKey: !!value.apiKey,
			hasWebhookSecret: !!value.webhookSecret,
			lastValidated: setting.lastValidated ?? null,
		}
	},
})

// Get Tailscale credentials (returns actual values - for gateway use only)
// This is called via HTTP API by the gateway to generate ephemeral auth keys
export const getTailscaleCredentials = query({
	args: {},
	handler: async (ctx) => {
		const setting = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", "tailscale"))
			.first()

		if (!setting) {
			return { tailnetId: undefined, apiKey: undefined }
		}

		const value = setting.value as {
			tailnetId?: string
			apiKey?: string
		}
		return {
			tailnetId: value.tailnetId,
			apiKey: value.apiKey,
		}
	},
})

// Create or update a setting
export const upsert = mutation({
	args: {
		key: v.string(),
		value: v.any(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.first()

		const now = Date.now()

		if (existing) {
			await ctx.db.patch(existing._id, {
				value: args.value,
				updatedAt: now,
			})
			return existing._id
		} else {
			const id = await ctx.db.insert("settings", {
				key: args.key,
				value: args.value,
				createdAt: now,
				updatedAt: now,
			})
			return id
		}
	},
})

// Mark a setting as validated
export const markValidated = mutation({
	args: { key: v.string() },
	handler: async (ctx, args) => {
		const setting = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.first()

		if (!setting) {
			throw new Error(`Setting not found: ${args.key}`)
		}

		await ctx.db.patch(setting._id, {
			lastValidated: Date.now(),
			updatedAt: Date.now(),
		})
	},
})

// Delete a setting
export const deleteSetting = mutation({
	args: { key: v.string() },
	handler: async (ctx, args) => {
		const setting = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.first()

		if (setting) {
			await ctx.db.delete(setting._id)
		}
	},
})

// =============================================================================
// Agent Gateway Settings
// =============================================================================

const DEFAULT_GATEWAY_URL = "http://localhost:3100"

// Get agent gateway configuration
export const getGatewayConfig = query({
	args: {},
	handler: async (ctx) => {
		const setting = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", "agentGateway"))
			.first()

		if (!setting) {
			return {
				url: DEFAULT_GATEWAY_URL,
				defaultServer: null,
				defaultRepo: null,
				lastValidated: null,
			}
		}

		const value = setting.value as {
			url?: string
			defaultServer?: string
			defaultRepo?: string
		}
		return {
			url: value.url ?? DEFAULT_GATEWAY_URL,
			defaultServer: value.defaultServer ?? null,
			defaultRepo: value.defaultRepo ?? null,
			lastValidated: setting.lastValidated ?? null,
		}
	},
})

// Internal query for gateway config (used by actions)
export const getGatewayConfigInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const setting = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", "agentGateway"))
			.first()

		if (!setting) {
			return {
				url: DEFAULT_GATEWAY_URL,
				defaultServer: null,
				defaultRepo: null,
			}
		}

		const value = setting.value as {
			url?: string
			defaultServer?: string
			defaultRepo?: string
		}
		return {
			url: value.url ?? DEFAULT_GATEWAY_URL,
			defaultServer: value.defaultServer ?? null,
			defaultRepo: value.defaultRepo ?? null,
		}
	},
})

// Set Tailscale configuration (merges with existing values)
export const setTailscaleConfig = mutation({
	args: {
		tailnetId: v.optional(v.string()),
		apiKey: v.optional(v.string()),
		webhookSecret: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", "tailscale"))
			.first()

		const now = Date.now()

		// Build the value object, preserving existing values
		const existingValue = (existing?.value as Record<string, unknown>) ?? {}
		const value = {
			...existingValue,
			...(args.tailnetId !== undefined ? { tailnetId: args.tailnetId } : {}),
			...(args.apiKey !== undefined ? { apiKey: args.apiKey } : {}),
			...(args.webhookSecret !== undefined
				? { webhookSecret: args.webhookSecret }
				: {}),
		}

		if (existing) {
			await ctx.db.patch(existing._id, {
				value,
				updatedAt: now,
			})
			return existing._id
		} else {
			const id = await ctx.db.insert("settings", {
				key: "tailscale",
				value,
				createdAt: now,
				updatedAt: now,
			})
			return id
		}
	},
})

// Set agent gateway configuration
export const setGatewayConfig = mutation({
	args: {
		url: v.optional(v.string()),
		defaultServer: v.optional(v.string()),
		defaultRepo: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", "agentGateway"))
			.first()

		const now = Date.now()

		// Build the value object, preserving existing values
		const existingValue = (existing?.value as Record<string, unknown>) ?? {}
		const value = {
			...existingValue,
			...(args.url !== undefined ? { url: args.url } : {}),
			...(args.defaultServer !== undefined
				? { defaultServer: args.defaultServer }
				: {}),
			...(args.defaultRepo !== undefined
				? { defaultRepo: args.defaultRepo }
				: {}),
		}

		if (existing) {
			await ctx.db.patch(existing._id, {
				value,
				updatedAt: now,
			})
			return existing._id
		} else {
			const id = await ctx.db.insert("settings", {
				key: "agentGateway",
				value,
				createdAt: now,
				updatedAt: now,
			})
			return id
		}
	},
})
