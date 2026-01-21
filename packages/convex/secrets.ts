import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

// Get a single secret by key
export const get = query({
	args: { key: v.string() },
	handler: async (ctx, { key }) => {
		const secret = await ctx.db
			.query("secrets")
			.withIndex("by_key", (q) => q.eq("key", key))
			.first()
		return secret
	},
})

// Get multiple secrets by keys
export const getMultiple = query({
	args: { keys: v.array(v.string()) },
	handler: async (ctx, { keys }) => {
		const secrets: Record<string, string> = {}
		for (const key of keys) {
			const secret = await ctx.db
				.query("secrets")
				.withIndex("by_key", (q) => q.eq("key", key))
				.first()
			if (secret) secrets[key] = secret.value
		}
		return secrets
	},
})

// List all secrets (keys and descriptions only, not values)
export const list = query({
	args: {},
	handler: async (ctx) => {
		const secrets = await ctx.db.query("secrets").collect()
		return secrets.map((s) => ({
			_id: s._id,
			key: s.key,
			description: s.description,
			hasValue: !!s.value,
		}))
	},
})

// Set a secret (create or update)
export const set = mutation({
	args: {
		key: v.string(),
		value: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (ctx, { key, value, description }) => {
		const existing = await ctx.db
			.query("secrets")
			.withIndex("by_key", (q) => q.eq("key", key))
			.first()

		if (existing) {
			await ctx.db.patch(existing._id, { value, description })
			return existing._id
		} else {
			return await ctx.db.insert("secrets", { key, value, description })
		}
	},
})

// Delete a secret by key
export const deleteSecret = mutation({
	args: { key: v.string() },
	handler: async (ctx, { key }) => {
		const existing = await ctx.db
			.query("secrets")
			.withIndex("by_key", (q) => q.eq("key", key))
			.first()

		if (existing) {
			await ctx.db.delete(existing._id)
			return true
		}
		return false
	},
})
