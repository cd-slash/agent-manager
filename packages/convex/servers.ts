import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { serverStatusValidator } from "./validators";
import { patchWithTimestamp } from "./internal/updateUtils";
import { deleteServerCascade } from "./internal/cascadeDelete";

// List all servers
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("servers").collect();
  },
});

// Get server by ID
export const get = query({
  args: { id: v.id("servers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get server with containers
export const getWithContainers = query({
  args: { id: v.id("servers") },
  handler: async (ctx, args) => {
    const server = await ctx.db.get(args.id);
    if (!server) return null;

    const containers = await ctx.db
      .query("containers")
      .withIndex("by_server", (q) => q.eq("serverId", args.id))
      .collect();

    return { ...server, containers };
  },
});

// List servers by region
export const listByRegion = query({
  args: { region: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("servers")
      .withIndex("by_region", (q) => q.eq("region", args.region))
      .collect();
  },
});

// List servers by status
export const listByStatus = query({
  args: { status: serverStatusValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("servers")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});

// Get metrics history for a server
export const getMetricsHistory = query({
  args: {
    serverId: v.id("servers"),
    limit: v.optional(v.number()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("serverMetrics")
      .withIndex("by_server_and_timestamp", (q) =>
        q.eq("serverId", args.serverId)
      );

    if (args.since !== undefined) {
      const since = args.since;
      query = ctx.db
        .query("serverMetrics")
        .withIndex("by_server_and_timestamp", (q) =>
          q.eq("serverId", args.serverId).gte("timestamp", since)
        );
    }

    const metrics = await query.collect();
    const sorted = metrics.sort((a, b) => b.timestamp - a.timestamp);

    if (args.limit) {
      return sorted.slice(0, args.limit);
    }
    return sorted;
  },
});

// Get aggregate stats for all servers
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const servers = await ctx.db.query("servers").collect();

    const online = servers.filter((s) => s.status === "online").length;
    const maintenance = servers.filter((s) => s.status === "maintenance").length;
    const offline = servers.filter((s) => s.status === "offline").length;

    const avgCpu =
      servers.length > 0
        ? servers.reduce((sum, s) => sum + s.cpu, 0) / servers.length
        : 0;
    const avgMem =
      servers.length > 0
        ? servers.reduce((sum, s) => sum + s.mem, 0) / servers.length
        : 0;

    return {
      total: servers.length,
      online,
      maintenance,
      offline,
      avgCpu,
      avgMem,
    };
  },
});

// Create a new server
export const create = mutation({
  args: {
    name: v.string(),
    ip: v.string(),
    region: v.string(),
    status: v.optional(serverStatusValidator),
    cpu: v.optional(v.number()),
    mem: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const serverId = await ctx.db.insert("servers", {
      name: args.name,
      ip: args.ip,
      region: args.region,
      status: args.status ?? "online",
      cpu: args.cpu ?? 0,
      mem: args.mem ?? 0,
      createdAt: now,
      updatedAt: now,
    });

    return serverId;
  },
});

// Update server details
export const update = mutation({
  args: {
    id: v.id("servers"),
    name: v.optional(v.string()),
    ip: v.optional(v.string()),
    region: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Server not found");

    await patchWithTimestamp(ctx.db, id, updates);
  },
});

// Update server status
export const updateStatus = mutation({
  args: {
    id: v.id("servers"),
    status: serverStatusValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Server not found");

    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// Update server metrics
export const updateMetrics = mutation({
  args: {
    id: v.id("servers"),
    cpu: v.number(),
    mem: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Server not found");

    await ctx.db.patch(args.id, {
      cpu: args.cpu,
      mem: args.mem,
      updatedAt: Date.now(),
    });

    // Also record in metrics history
    await ctx.db.insert("serverMetrics", {
      serverId: args.id,
      cpu: args.cpu,
      mem: args.mem,
      timestamp: Date.now(),
    });
  },
});

// Delete a server and all related data
export const deleteServer = mutation({
  args: { id: v.id("servers") },
  handler: async (ctx, args) => {
    const server = await ctx.db.get(args.id);
    if (!server) throw new Error("Server not found");

    await deleteServerCascade(ctx.db, args.id);
  },
});
