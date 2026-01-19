import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { notificationTypeValidator } from "./validators";

// List recent notifications (newest first)
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("notifications")
      .withIndex("by_created")
      .order("desc")
      .take(limit);
  },
});

// List unread notifications
export const listUnread = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("notifications")
      .withIndex("by_read_and_created", (q) => q.eq("read", false))
      .order("desc")
      .take(limit);
  },
});

// Get unread count
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_read", (q) => q.eq("read", false))
      .collect();
    return unread.length;
  },
});

// Create a new notification
export const create = mutation({
  args: {
    type: notificationTypeValidator,
    title: v.string(),
    message: v.optional(v.string()),
    sourceTable: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const notificationId = await ctx.db.insert("notifications", {
      type: args.type,
      title: args.title,
      message: args.message,
      sourceTable: args.sourceTable,
      sourceId: args.sourceId,
      read: false,
      createdAt: now,
      expiresAt: args.expiresAt ?? now + 30 * 24 * 60 * 60 * 1000, // Default 30 days
    });
    return notificationId;
  },
});

// Mark notification as read
export const markAsRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Notification not found");
    await ctx.db.patch(args.id, { read: true });
  },
});

// Mark all notifications as read
export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_read", (q) => q.eq("read", false))
      .collect();

    await Promise.all(
      unread.map((n) => ctx.db.patch(n._id, { read: true }))
    );

    return unread.length;
  },
});

// Dismiss notification (soft delete)
export const dismiss = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Notification not found");
    await ctx.db.patch(args.id, {
      dismissedAt: Date.now(),
      read: true,
    });
  },
});

// Delete notification (hard delete)
export const remove = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Notification not found");
    await ctx.db.delete(args.id);
  },
});

// Clean up expired notifications
export const cleanupExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("notifications")
      .filter((q) =>
        q.and(
          q.neq(q.field("expiresAt"), undefined),
          q.lt(q.field("expiresAt"), now)
        )
      )
      .collect();

    await Promise.all(expired.map((n) => ctx.db.delete(n._id)));

    return expired.length;
  },
});
