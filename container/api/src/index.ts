/**
 * Container API Server
 *
 * HTTP server that wraps the Claude CLI for remote orchestration.
 * Provides REST endpoints and SSE streaming for task execution.
 *
 * This server runs inside each container and is accessed by the manager app
 * via Tailscale networking (proxied on port 80 via tailscale serve).
 */

import { Elysia } from "elysia";
import { AuthManager } from "./auth-manager";
import { ProcessManager } from "./process-manager";
import { SessionManager } from "./session-manager";
import { WebSocketIntegration } from "./websocket-integration";
import type { MessageOptions, HealthStatus, ModelInfo } from "./types";

const PORT = parseInt(process.env.PORT || "4096", 10);
const MANAGER_WS_URL = process.env.MANAGER_WS_URL; // e.g., ws://manager.ts.net:8048/containers
const CONTAINER_ID = process.env.CONTAINER_ID || process.env.TS_HOSTNAME || "unknown";
const HOSTNAME = process.env.TS_HOSTNAME || "localhost";
const startTime = Date.now();

// Initialize managers
const authManager = new AuthManager();
const processManager = new ProcessManager();
const sessionManager = new SessionManager();

// WebSocket integration (optional - enabled when MANAGER_WS_URL is set)
let wsIntegration: WebSocketIntegration | null = null;

// Start watching for auth changes
authManager.startWatching().catch(console.error);

// Log events from managers
authManager.on("auth:changed", (data) => {
  console.log("[api] Auth status changed:", data);
});

processManager.on("process:started", (data) => {
  console.log("[api] Process started:", data.processId);
});

processManager.on("process:completed", (data) => {
  console.log("[api] Process completed:", data.processId);
});

processManager.on("process:error", (data) => {
  console.log("[api] Process error:", data.processId, data.error);
});

// Create the API server
const app = new Elysia()
  // ==========================================================================
  // Health Check
  // ==========================================================================
  .get("/health", async (): Promise<HealthStatus> => {
    const activeProcesses = processManager.getActiveProcesses();
    return {
      status: "ok",
      activeProcesses: activeProcesses.count,
      version: "1.0.0",
      uptime: Date.now() - startTime,
    };
  })

  // ==========================================================================
  // Authentication Endpoints
  // ==========================================================================
  .get("/auth/anthropic", async () => {
    return await authManager.getStatus();
  })

  .post("/auth/anthropic/oauth", async ({ body }) => {
    const { token } = body as { token: string };

    if (!token) {
      return new Response(JSON.stringify({ error: "Token is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      await authManager.setToken(token);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  })

  .delete("/auth/anthropic/oauth", async () => {
    try {
      await authManager.removeToken();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  })

  .post("/auth/anthropic/oauth/start", async () => {
    try {
      const result = await authManager.startOAuthFlow();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  })

  .post("/auth/anthropic/oauth/complete", async ({ body }) => {
    const { flowId, code } = body as { flowId: string; code: string };

    if (!flowId || !code) {
      return new Response(JSON.stringify({ error: "flowId and code are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const result = await authManager.completeOAuthFlow(flowId, code);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  })

  // ==========================================================================
  // Message Endpoints
  // ==========================================================================
  .post("/messages/", async ({ body, set }) => {
    const options = body as MessageOptions & { stream?: boolean };

    if (!options.message) {
      set.status = 400;
      return { error: "Message is required" };
    }

    // Streaming mode
    if (options.stream !== false) {
      // Return SSE stream
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          const sendEvent = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(`event: ${event}\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          try {
            for await (const event of processManager.executeStream(options)) {
              switch (event.type) {
                case "start":
                  sendEvent("start", { processId: event.processId });
                  break;
                case "data":
                  sendEvent("data", event.data);
                  break;
                case "error":
                  sendEvent("error", { exitCode: event.exitCode, stderr: event.error });
                  break;
                case "done":
                  sendEvent("done", {});
                  break;
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            sendEvent("error", { error: message });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Sync mode
    try {
      const result = await processManager.execute(options);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set.status = 500;
      return { error: message };
    }
  })

  .get("/messages/active", () => {
    return processManager.getActiveProcesses();
  })

  .post("/messages/:processId/abort", ({ params, set }) => {
    const processId = parseInt(params.processId, 10);

    if (isNaN(processId)) {
      set.status = 400;
      return { error: "Invalid process ID" };
    }

    const success = processManager.abort(processId);

    if (!success) {
      set.status = 404;
      return { error: "Process not found" };
    }

    return { success: true };
  })

  // ==========================================================================
  // Session Endpoints
  // ==========================================================================
  .get("/sessions/", async () => {
    const sessions = await sessionManager.listSessions();
    return { sessions };
  })

  .get("/sessions/:sessionId", async ({ params, set }) => {
    const session = await sessionManager.getSession(params.sessionId);

    if (!session) {
      set.status = 404;
      return { error: "Session not found" };
    }

    return { session };
  })

  .get("/sessions/:sessionId/messages", async ({ params, set }) => {
    const session = await sessionManager.getSession(params.sessionId);

    if (!session) {
      set.status = 404;
      return { error: "Session not found" };
    }

    const messages = await sessionManager.getSessionMessages(params.sessionId);
    return { messages };
  })

  .delete("/sessions/:sessionId", async ({ params, set }) => {
    const success = await sessionManager.deleteSession(params.sessionId);

    if (!success) {
      set.status = 404;
      return { error: "Session not found" };
    }

    return { success: true };
  })

  // ==========================================================================
  // Manager Connection Endpoints
  // ==========================================================================
  .post("/manager/takeover", async ({ body, set }) => {
    const { managerUrl, managerId } = body as { managerUrl: string; managerId?: string };

    if (!managerUrl) {
      set.status = 400;
      return { success: false, error: "managerUrl is required" };
    }

    console.log(`[api] Manager takeover requested: ${managerId || "unknown"} at ${managerUrl}`);

    // Track current manager info for response
    const previousManager = wsIntegration?.getState().managerUrl || null;

    // Disconnect from current manager if connected
    if (wsIntegration) {
      console.log("[api] Disconnecting from current manager...");
      try {
        await wsIntegration.disconnect();
      } catch (err) {
        console.error("[api] Error disconnecting from current manager:", err);
      }
      wsIntegration = null;
    }

    // Connect to new manager
    console.log(`[api] Connecting to new manager: ${managerUrl}`);
    wsIntegration = new WebSocketIntegration(
      {
        managerUrl,
        containerId: CONTAINER_ID,
        hostname: HOSTNAME,
      },
      authManager,
      processManager,
      sessionManager
    );

    try {
      await wsIntegration.connect();
      console.log(`[api] Connected to new manager: ${managerId || managerUrl}`);
      return {
        success: true,
        connected: managerUrl,
        managerId,
        previousManager,
      };
    } catch (error) {
      console.error("[api] Failed to connect to new manager:", error);
      set.status = 500;
      return {
        success: false,
        error: error instanceof Error ? error.message : "Connection failed",
        previousManager,
      };
    }
  })

  .get("/manager/status", () => {
    const state = wsIntegration?.getState();
    return {
      connected: state?.connected || false,
      managerUrl: state?.managerUrl || null,
      state: state?.state || "disconnected",
    };
  })

  // ==========================================================================
  // Model Endpoints
  // ==========================================================================
  .get("/models", (): ModelInfo[] => {
    // Return available Claude models
    return [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic" },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4", provider: "anthropic" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: "anthropic" },
    ];
  });

// ==========================================================================
// Start Server
// ==========================================================================
app.listen(PORT, async () => {
  console.log(`[api] Container API server running on port ${PORT}`);
  console.log(`[api] Health check: http://localhost:${PORT}/health`);

  // Start WebSocket connection to manager if configured
  if (MANAGER_WS_URL) {
    console.log(`[api] Connecting to manager via WebSocket: ${MANAGER_WS_URL}`);
    wsIntegration = new WebSocketIntegration(
      {
        managerUrl: MANAGER_WS_URL,
        containerId: CONTAINER_ID,
        hostname: HOSTNAME,
      },
      authManager,
      processManager,
      sessionManager
    );

    try {
      await wsIntegration.connect();
      console.log("[api] Connected to manager via WebSocket");
    } catch (error) {
      console.error("[api] Failed to connect to manager:", error);
      // Continue running - REST API still works
    }
  } else {
    console.log("[api] MANAGER_WS_URL not set, running in REST-only mode");
  }
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[api] Received SIGTERM, shutting down...");
  processManager.abortAll();
  await wsIntegration?.disconnect();
  await authManager.stopWatching();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[api] Received SIGINT, shutting down...");
  processManager.abortAll();
  await wsIntegration?.disconnect();
  await authManager.stopWatching();
  process.exit(0);
});

// Export for testing
export { app, authManager, processManager, sessionManager };

// Export app type for Eden Treaty type inference
export type ContainerApp = typeof app;
