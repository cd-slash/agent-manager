import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { webhookSourceValidator, webhookStatusValidator } from "./validators";

// List webhook events by source
export const listBySource = query({
  args: { source: webhookSourceValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("webhookEvents")
      .withIndex("by_source_and_status", (q) => q.eq("source", args.source))
      .collect();
  },
});

// List webhook events by status
export const listBySourceAndStatus = query({
  args: {
    source: webhookSourceValidator,
    status: webhookStatusValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("webhookEvents")
      .withIndex("by_source_and_status", (q) =>
        q.eq("source", args.source).eq("status", args.status)
      )
      .collect();
  },
});

// List pending webhooks (for retry processing)
export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("webhookEvents")
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
    return pending;
  },
});

// List failed webhooks (for retry)
export const listFailed = query({
  args: { maxRetries: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const maxRetries = args.maxRetries ?? 3;
    const failed = await ctx.db
      .query("webhookEvents")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "failed"),
          q.lt(q.field("retryCount"), maxRetries)
        )
      )
      .collect();
    return failed;
  },
});

// Get recent webhook events
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db.query("webhookEvents").order("desc").take(limit);
  },
});

// Get webhook event by ID
export const get = query({
  args: { id: v.id("webhookEvents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Store a new webhook event
export const store = mutation({
  args: {
    source: webhookSourceValidator,
    eventType: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const eventId = await ctx.db.insert("webhookEvents", {
      source: args.source,
      eventType: args.eventType,
      payload: args.payload,
      status: "pending",
      retryCount: 0,
      createdAt: Date.now(),
    });

    return eventId;
  },
});

// Mark webhook as processing
export const markProcessing = mutation({
  args: { id: v.id("webhookEvents") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Webhook event not found");

    await ctx.db.patch(args.id, { status: "processing" });
  },
});

// Mark webhook as processed
export const markProcessed = mutation({
  args: { id: v.id("webhookEvents") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Webhook event not found");

    await ctx.db.patch(args.id, {
      status: "processed",
      processedAt: Date.now(),
    });
  },
});

// Mark webhook as failed
export const markFailed = mutation({
  args: {
    id: v.id("webhookEvents"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Webhook event not found");

    await ctx.db.patch(args.id, {
      status: "failed",
      errorMessage: args.errorMessage,
      retryCount: existing.retryCount + 1,
    });
  },
});

// Reset failed webhook for retry
export const resetForRetry = mutation({
  args: { id: v.id("webhookEvents") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Webhook event not found");

    await ctx.db.patch(args.id, {
      status: "pending",
      errorMessage: undefined,
    });
  },
});

// Delete old processed webhooks
export const cleanupProcessed = mutation({
  args: { olderThanDays: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;

    const oldEvents = await ctx.db
      .query("webhookEvents")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "processed"),
          q.lt(q.field("createdAt"), cutoff)
        )
      )
      .collect();

    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
    }

    return oldEvents.length;
  },
});

// Get webhook stats
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("webhookEvents").collect();

    const pending = events.filter((e) => e.status === "pending").length;
    const processing = events.filter((e) => e.status === "processing").length;
    const processed = events.filter((e) => e.status === "processed").length;
    const failed = events.filter((e) => e.status === "failed").length;

    const bySource = {
      github: events.filter((e) => e.source === "github").length,
      cicd: events.filter((e) => e.source === "cicd").length,
      agent: events.filter((e) => e.source === "agent").length,
    };

    return {
      total: events.length,
      pending,
      processing,
      processed,
      failed,
      bySource,
    };
  },
});
