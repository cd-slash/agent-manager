import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { containerStatusValidator } from "./validators";
import { patchWithTimestamp } from "./internal/updateUtils";

// List all containers
export const list = query({
  args: {},
  handler: async (ctx) => {
    const containers = await ctx.db.query("containers").collect();
    // Enrich with server info
    const enriched = await Promise.all(
      containers.map(async (container) => {
        const server = container.serverId ? await ctx.db.get(container.serverId) : null;
        return { ...container, serverName: server?.name ?? null };
      })
    );
    return enriched;
  },
});

// List containers by server
export const listByServer = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("containers")
      .withIndex("by_server", (q) => q.eq("serverId", args.serverId))
      .collect();
  },
});

// List containers by status
export const listByStatus = query({
  args: { status: containerStatusValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("containers")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});

// Get container by ID
export const get = query({
  args: { id: v.id("containers") },
  handler: async (ctx, args) => {
    const container = await ctx.db.get(args.id);
    if (!container) return null;

    const server = container.serverId ? await ctx.db.get(container.serverId) : null;
    return { ...container, serverName: server?.name ?? null };
  },
});

// Get container stats
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const containers = await ctx.db.query("containers").collect();

    const running = containers.filter((c) => c.status === "running").length;
    const stopped = containers.filter((c) => c.status === "stopped").length;
    const restarting = containers.filter((c) => c.status === "restarting").length;
    const paused = containers.filter((c) => c.status === "paused").length;
    const exited = containers.filter((c) => c.status === "exited").length;

    return {
      total: containers.length,
      running,
      stopped,
      restarting,
      paused,
      exited,
    };
  },
});

// Create a new container
export const create = mutation({
  args: {
    serverId: v.id("servers"),
    containerId: v.string(),
    name: v.string(),
    image: v.string(),
    port: v.string(),
    status: v.optional(containerStatusValidator),
  },
  handler: async (ctx, args) => {
    // Verify server exists
    const server = await ctx.db.get(args.serverId);
    if (!server) throw new Error("Server not found");

    const now = Date.now();
    const id = await ctx.db.insert("containers", {
      serverId: args.serverId,
      containerId: args.containerId,
      name: args.name,
      image: args.image,
      port: args.port,
      status: args.status ?? "stopped",
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

// Update container details
export const update = mutation({
  args: {
    id: v.id("containers"),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    port: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Container not found");

    await patchWithTimestamp(ctx.db, id, updates);
  },
});

// Update container status
export const updateStatus = mutation({
  args: {
    id: v.id("containers"),
    status: containerStatusValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Container not found");

    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// Start a container
export const start = mutation({
  args: { id: v.id("containers") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Container not found");

    await ctx.db.patch(args.id, {
      status: "running",
      updatedAt: Date.now(),
    });
  },
});

// Stop a container
export const stop = mutation({
  args: { id: v.id("containers") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Container not found");

    await ctx.db.patch(args.id, {
      status: "stopped",
      updatedAt: Date.now(),
    });
  },
});

// Restart a container
export const restart = mutation({
  args: { id: v.id("containers") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Container not found");

    // First set to restarting
    await ctx.db.patch(args.id, {
      status: "restarting",
      updatedAt: Date.now(),
    });

    // In real implementation, this would trigger actual restart
    // and the status would be updated via webhook/callback
  },
});

// Pause a container
export const pause = mutation({
  args: { id: v.id("containers") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Container not found");

    await ctx.db.patch(args.id, {
      status: "paused",
      updatedAt: Date.now(),
    });
  },
});

// Unpause a container
export const unpause = mutation({
  args: { id: v.id("containers") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Container not found");

    await ctx.db.patch(args.id, {
      status: "running",
      updatedAt: Date.now(),
    });
  },
});

// Delete a container
export const deleteContainer = mutation({
  args: { id: v.id("containers") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Container not found");

    await ctx.db.delete(args.id);
  },
});

// Move container to different server
export const moveToServer = mutation({
  args: {
    id: v.id("containers"),
    newServerId: v.id("servers"),
  },
  handler: async (ctx, args) => {
    const container = await ctx.db.get(args.id);
    if (!container) throw new Error("Container not found");

    const server = await ctx.db.get(args.newServerId);
    if (!server) throw new Error("Target server not found");

    await ctx.db.patch(args.id, {
      serverId: args.newServerId,
      updatedAt: Date.now(),
    });
  },
});
