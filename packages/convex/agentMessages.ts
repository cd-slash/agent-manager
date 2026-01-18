import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new message (output from CLI)
export const create = mutation({
  args: {
    sessionId: v.string(),
    messageType: v.union(
      v.literal("assistant"),
      v.literal("result"),
      v.literal("system")
    ),
    content: v.string(), // JSON stringified CliOutputMessage
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentMessages", {
      sessionId: args.sessionId,
      messageType: args.messageType,
      content: args.content,
      timestamp: args.timestamp,
    });
  },
});

// Get all messages for a session (ordered by timestamp)
export const listBySession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentMessages")
      .withIndex("by_session_and_timestamp", (q) =>
        q.eq("sessionId", args.sessionId)
      )
      .order("asc")
      .collect();
  },
});

// Get messages for a session after a certain timestamp (for incremental loading)
export const listBySessionAfter = query({
  args: {
    sessionId: v.string(),
    afterTimestamp: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentMessages")
      .withIndex("by_session_and_timestamp", (q) =>
        q.eq("sessionId", args.sessionId).gt("timestamp", args.afterTimestamp)
      )
      .order("asc")
      .collect();
  },
});

// Get the most recent messages for a session
export const listRecentBySession = query({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const messages = await ctx.db
      .query("agentMessages")
      .withIndex("by_session_and_timestamp", (q) =>
        q.eq("sessionId", args.sessionId)
      )
      .order("desc")
      .take(limit);

    // Return in ascending order
    return messages.reverse();
  },
});

// Get assistant messages only (for displaying conversation)
export const listAssistantMessages = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("agentMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return messages
      .filter((m) => m.messageType === "assistant")
      .sort((a, b) => a.timestamp - b.timestamp);
  },
});

// Delete all messages for a session (for cleanup)
export const deleteBySession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("agentMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    return messages.length;
  },
});

// Get message count for a session
export const countBySession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("agentMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return {
      total: messages.length,
      byType: {
        assistant: messages.filter((m) => m.messageType === "assistant").length,
        result: messages.filter((m) => m.messageType === "result").length,
        system: messages.filter((m) => m.messageType === "system").length,
      },
    };
  },
});
