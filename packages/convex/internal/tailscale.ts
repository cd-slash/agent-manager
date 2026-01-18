import {
  internalMutation,
  internalQuery,
  internalAction,
} from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// Tailscale device type from API
interface TailscaleDevice {
  id: string;
  name: string;
  hostname: string;
  addresses: string[];
  tags?: string[];
  lastSeen?: string;
  os?: string;
  authorized?: boolean;
  keyExpiryDisabled?: boolean;
}

// Get raw Tailscale credentials (internal only)
export const getCredentials = internalQuery({
  args: {},
  handler: async (ctx) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "tailscale"))
      .first();

    if (!setting) {
      return null;
    }

    const value = setting.value as { tailnetId?: string; apiKey?: string };
    return {
      tailnetId: value.tailnetId,
      apiKey: value.apiKey,
    };
  },
});

// Sync a device from Tailscale (upsert as server or container)
export const syncDevice = internalMutation({
  args: {
    nodeId: v.string(),
    hostname: v.string(),
    name: v.string(),
    ip: v.string(),
    tags: v.array(v.string()),
    deviceType: v.union(v.literal("server"), v.literal("container")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.deviceType === "server") {
      // Check if server already exists by tailscaleNodeId
      const existing = await ctx.db
        .query("servers")
        .withIndex("by_tailscale_node_id", (q) =>
          q.eq("tailscaleNodeId", args.nodeId)
        )
        .first();

      if (existing) {
        // Update existing server
        await ctx.db.patch(existing._id, {
          name: args.name,
          ip: args.ip,
          tailscaleHostname: args.hostname,
          tailscaleTags: args.tags,
          updatedAt: now,
        });
        return { updated: true, id: existing._id };
      } else {
        // Create new server
        const id = await ctx.db.insert("servers", {
          name: args.name,
          ip: args.ip,
          region: "tailscale", // Default region for Tailscale devices
          status: "online",
          cpu: 0,
          mem: 0,
          tailscaleNodeId: args.nodeId,
          tailscaleHostname: args.hostname,
          tailscaleTags: args.tags,
          createdAt: now,
          updatedAt: now,
        });
        return { created: true, id };
      }
    } else {
      // Container (code-agent)
      const existing = await ctx.db
        .query("containers")
        .withIndex("by_tailscale_node_id", (q) =>
          q.eq("tailscaleNodeId", args.nodeId)
        )
        .first();

      if (existing) {
        // Update existing container
        await ctx.db.patch(existing._id, {
          name: args.name,
          tailscaleHostname: args.hostname,
          tailscaleTags: args.tags,
          updatedAt: now,
        });
        return { updated: true, id: existing._id };
      } else {
        // Create new container
        const id = await ctx.db.insert("containers", {
          name: args.name,
          containerId: args.nodeId, // Use Tailscale node ID as container ID
          image: "tailscale-agent",
          status: "running",
          port: "",
          tailscaleNodeId: args.nodeId,
          tailscaleHostname: args.hostname,
          tailscaleTags: args.tags,
          createdAt: now,
          updatedAt: now,
        });
        return { created: true, id };
      }
    }
  },
});

// Remove a device by tailscaleNodeId
export const removeDevice = internalMutation({
  args: {
    nodeId: v.string(),
    deviceType: v.union(v.literal("server"), v.literal("container")),
  },
  handler: async (ctx, args) => {
    if (args.deviceType === "server") {
      const server = await ctx.db
        .query("servers")
        .withIndex("by_tailscale_node_id", (q) =>
          q.eq("tailscaleNodeId", args.nodeId)
        )
        .first();

      if (server) {
        await ctx.db.delete(server._id);
        return { deleted: true, id: server._id };
      }
    } else {
      const container = await ctx.db
        .query("containers")
        .withIndex("by_tailscale_node_id", (q) =>
          q.eq("tailscaleNodeId", args.nodeId)
        )
        .first();

      if (container) {
        await ctx.db.delete(container._id);
        return { deleted: true, id: container._id };
      }
    }

    return { deleted: false };
  },
});

// Mark Tailscale credentials as validated
export const markCredentialsValidated = internalMutation({
  args: {},
  handler: async (ctx) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "tailscale"))
      .first();

    if (setting) {
      await ctx.db.patch(setting._id, {
        lastValidated: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// Get all Tailscale-managed servers (for cleanup)
export const getTailscaleServers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const servers = await ctx.db.query("servers").collect();
    return servers.filter((s) => s.tailscaleNodeId);
  },
});

// Get all Tailscale-managed containers (for cleanup)
export const getTailscaleContainers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const containers = await ctx.db.query("containers").collect();
    return containers.filter((c) => c.tailscaleNodeId);
  },
});

// Perform full sync from Tailscale API
export const performFullSync = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get credentials
    const credentials = await ctx.runQuery(
      internal.internal.tailscale.getCredentials
    );

    if (!credentials?.tailnetId || !credentials?.apiKey) {
      throw new Error("Tailscale credentials not configured");
    }

    // Fetch devices from Tailscale API
    const response = await fetch(
      `https://api.tailscale.com/api/v2/tailnet/${credentials.tailnetId}/devices`,
      {
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tailscale API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as { devices: TailscaleDevice[] };
    const devices = data.devices || [];

    // Filter devices by tags
    const hostServers: TailscaleDevice[] = [];
    const codeAgents: TailscaleDevice[] = [];

    for (const device of devices) {
      const tags = device.tags || [];
      if (tags.includes("tag:code-agent-host")) {
        hostServers.push(device);
      } else if (tags.includes("tag:code-agent")) {
        codeAgents.push(device);
      }
    }

    // Sync host servers
    const serverNodeIds = new Set<string>();
    for (const device of hostServers) {
      const ip = device.addresses?.[0] || "";
      await ctx.runMutation(internal.internal.tailscale.syncDevice, {
        nodeId: device.id,
        hostname: device.hostname,
        name: device.name || device.hostname,
        ip,
        tags: device.tags || [],
        deviceType: "server",
      });
      serverNodeIds.add(device.id);
    }

    // Sync code agents as containers
    const containerNodeIds = new Set<string>();
    for (const device of codeAgents) {
      const ip = device.addresses?.[0] || "";
      await ctx.runMutation(internal.internal.tailscale.syncDevice, {
        nodeId: device.id,
        hostname: device.hostname,
        name: device.name || device.hostname,
        ip,
        tags: device.tags || [],
        deviceType: "container",
      });
      containerNodeIds.add(device.id);
    }

    // Remove stale Tailscale-managed servers not in the API response
    const existingServers = await ctx.runQuery(
      internal.internal.tailscale.getTailscaleServers
    );
    for (const server of existingServers) {
      if (server.tailscaleNodeId && !serverNodeIds.has(server.tailscaleNodeId)) {
        await ctx.runMutation(internal.internal.tailscale.removeDevice, {
          nodeId: server.tailscaleNodeId,
          deviceType: "server",
        });
      }
    }

    // Remove stale Tailscale-managed containers not in the API response
    const existingContainers = await ctx.runQuery(
      internal.internal.tailscale.getTailscaleContainers
    );
    for (const container of existingContainers) {
      if (
        container.tailscaleNodeId &&
        !containerNodeIds.has(container.tailscaleNodeId)
      ) {
        await ctx.runMutation(internal.internal.tailscale.removeDevice, {
          nodeId: container.tailscaleNodeId,
          deviceType: "container",
        });
      }
    }

    // Mark credentials as validated
    await ctx.runMutation(internal.internal.tailscale.markCredentialsValidated);

    return {
      serversAdded: hostServers.length,
      containersAdded: codeAgents.length,
      totalDevices: devices.length,
    };
  },
});
