import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

// Record server metrics
export const recordServerMetrics = internalMutation({
  args: {
    serverId: v.id("servers"),
    cpu: v.number(),
    mem: v.number(),
    networkIn: v.optional(v.number()),
    networkOut: v.optional(v.number()),
    diskUsage: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify server exists
    const server = await ctx.db.get(args.serverId);
    if (!server) throw new Error("Server not found");

    // Update current server metrics
    await ctx.db.patch(args.serverId, {
      cpu: args.cpu,
      mem: args.mem,
      updatedAt: Date.now(),
    });

    // Record in metrics history
    const metricId = await ctx.db.insert("serverMetrics", {
      serverId: args.serverId,
      cpu: args.cpu,
      mem: args.mem,
      networkIn: args.networkIn,
      networkOut: args.networkOut,
      diskUsage: args.diskUsage,
      timestamp: Date.now(),
    });

    return metricId;
  },
});

// Update container status
export const updateContainerStatus = internalMutation({
  args: {
    containerId: v.id("containers"),
    status: v.union(
      v.literal("running"),
      v.literal("stopped"),
      v.literal("restarting"),
      v.literal("paused"),
      v.literal("exited")
    ),
  },
  handler: async (ctx, args) => {
    const container = await ctx.db.get(args.containerId);
    if (!container) throw new Error("Container not found");

    await ctx.db.patch(args.containerId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// Clean up old metrics
export const cleanupOldMetrics = internalMutation({
  args: { olderThanDays: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;

    const oldMetrics = await ctx.db
      .query("serverMetrics")
      .filter((q) => q.lt(q.field("timestamp"), cutoff))
      .collect();

    for (const metric of oldMetrics) {
      await ctx.db.delete(metric._id);
    }

    return { deletedCount: oldMetrics.length };
  },
});

// Get aggregated metrics for a server over a time period
export const getAggregatedMetrics = internalQuery({
  args: {
    serverId: v.id("servers"),
    periodMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const since = Date.now() - args.periodMinutes * 60 * 1000;

    const metrics = await ctx.db
      .query("serverMetrics")
      .withIndex("by_server_and_timestamp", (q) =>
        q.eq("serverId", args.serverId).gte("timestamp", since)
      )
      .collect();

    if (metrics.length === 0) {
      return null;
    }

    const avgCpu = metrics.reduce((sum, m) => sum + m.cpu, 0) / metrics.length;
    const avgMem = metrics.reduce((sum, m) => sum + m.mem, 0) / metrics.length;
    const maxCpu = Math.max(...metrics.map((m) => m.cpu));
    const maxMem = Math.max(...metrics.map((m) => m.mem));
    const minCpu = Math.min(...metrics.map((m) => m.cpu));
    const minMem = Math.min(...metrics.map((m) => m.mem));

    return {
      avgCpu,
      avgMem,
      maxCpu,
      maxMem,
      minCpu,
      minMem,
      dataPoints: metrics.length,
      periodMinutes: args.periodMinutes,
    };
  },
});

// Get all servers with high resource usage
export const getHighUsageServers = internalQuery({
  args: {
    cpuThreshold: v.optional(v.number()),
    memThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cpuThreshold = args.cpuThreshold ?? 80;
    const memThreshold = args.memThreshold ?? 80;

    const servers = await ctx.db.query("servers").collect();

    return servers.filter(
      (server) =>
        server.cpu >= cpuThreshold || server.mem >= memThreshold
    );
  },
});

// Batch update metrics for multiple servers
export const batchRecordMetrics = internalMutation({
  args: {
    metrics: v.array(
      v.object({
        serverId: v.id("servers"),
        cpu: v.number(),
        mem: v.number(),
        networkIn: v.optional(v.number()),
        networkOut: v.optional(v.number()),
        diskUsage: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const timestamp = Date.now();
    const results = [];

    for (const metric of args.metrics) {
      // Update server current metrics
      const server = await ctx.db.get(metric.serverId);
      if (server) {
        await ctx.db.patch(metric.serverId, {
          cpu: metric.cpu,
          mem: metric.mem,
          updatedAt: timestamp,
        });

        // Record in history
        const metricId = await ctx.db.insert("serverMetrics", {
          serverId: metric.serverId,
          cpu: metric.cpu,
          mem: metric.mem,
          networkIn: metric.networkIn,
          networkOut: metric.networkOut,
          diskUsage: metric.diskUsage,
          timestamp,
        });

        results.push({ serverId: metric.serverId, metricId });
      }
    }

    return results;
  },
});
