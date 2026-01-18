import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get a setting by key
export const get = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    return setting;
  },
});

// Get Tailscale config (returns masked data for security)
export const getTailscaleConfig = query({
  args: {},
  handler: async (ctx) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "tailscale"))
      .first();

    if (!setting) {
      return {
        tailnetId: null,
        hasApiKey: false,
        hasWebhookSecret: false,
        lastValidated: null,
      };
    }

    const value = setting.value as { tailnetId?: string; apiKey?: string; webhookSecret?: string };
    return {
      tailnetId: value.tailnetId ?? null,
      hasApiKey: !!value.apiKey,
      hasWebhookSecret: !!value.webhookSecret,
      lastValidated: setting.lastValidated ?? null,
    };
  },
});

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
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedAt: now,
      });
      return existing._id;
    } else {
      const id = await ctx.db.insert("settings", {
        key: args.key,
        value: args.value,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    }
  },
});

// Mark a setting as validated
export const markValidated = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (!setting) {
      throw new Error(`Setting not found: ${args.key}`);
    }

    await ctx.db.patch(setting._id, {
      lastValidated: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Delete a setting
export const deleteSetting = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (setting) {
      await ctx.db.delete(setting._id);
    }
  },
});
