import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const http = httpRouter();

// GitHub webhook endpoint
http.route({
  path: "/webhooks/github",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const payload = await request.json();
      const eventType = request.headers.get("X-GitHub-Event") ?? "unknown";

      // Store the webhook event
      const eventId = await ctx.runMutation(api.webhooks.store, {
        source: "github",
        eventType,
        payload,
      });

      // Schedule async processing
      await ctx.scheduler.runAfter(0, internal.internal.webhookProcessing.processGithubWebhook, {
        eventId,
      });

      return new Response(JSON.stringify({ success: true, eventId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// CI/CD webhook endpoint
http.route({
  path: "/webhooks/cicd",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const payload = await request.json();
      const eventType = (payload as { event?: string }).event ?? "status_update";

      // Store the webhook event
      const eventId = await ctx.runMutation(api.webhooks.store, {
        source: "cicd",
        eventType,
        payload,
      });

      // Schedule async processing
      await ctx.scheduler.runAfter(0, internal.internal.webhookProcessing.processCicdWebhook, {
        eventId,
      });

      return new Response(JSON.stringify({ success: true, eventId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// AI agent callback endpoint
http.route({
  path: "/webhooks/agent/callback",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const payload = await request.json();
      const eventType = (payload as { type?: string }).type ?? "completion";

      // Store the webhook event
      const eventId = await ctx.runMutation(api.webhooks.store, {
        source: "agent",
        eventType,
        payload,
      });

      // Schedule async processing
      await ctx.scheduler.runAfter(0, internal.internal.webhookProcessing.processAgentCallback, {
        eventId,
      });

      return new Response(JSON.stringify({ success: true, eventId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Server metrics ingestion endpoint
http.route({
  path: "/api/metrics/server",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const payload = await request.json() as {
        serverId: string;
        cpu: number;
        mem: number;
        networkIn?: number;
        networkOut?: number;
        diskUsage?: number;
      };

      // Validate required fields
      if (!payload.serverId || typeof payload.cpu !== "number" || typeof payload.mem !== "number") {
        return new Response(
          JSON.stringify({ error: "Missing required fields: serverId, cpu, mem" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Record the metrics
      await ctx.runMutation(internal.internal.metrics.recordServerMetrics, {
        serverId: payload.serverId as any, // Cast to Id<"servers">
        cpu: payload.cpu,
        mem: payload.mem,
        networkIn: payload.networkIn,
        networkOut: payload.networkOut,
        diskUsage: payload.diskUsage,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Container status update endpoint
http.route({
  path: "/api/metrics/container",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const payload = await request.json() as {
        containerId: string;
        status: "running" | "stopped" | "restarting" | "paused" | "exited";
      };

      // Validate required fields
      if (!payload.containerId || !payload.status) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: containerId, status" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Update container status
      await ctx.runMutation(internal.internal.metrics.updateContainerStatus, {
        containerId: payload.containerId as any, // Cast to Id<"containers">
        status: payload.status,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Health check endpoint
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ status: "ok", timestamp: Date.now() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
