import type {
  ContainerToGatewayMessage,
  GatewayToContainerMessage,
  CreateSessionRequest,
} from "@agent-manager/agent-shared";
import { isResultMessage } from "@agent-manager/agent-shared";
import { ConnectionManager, type ContainerContext } from "./connections";
import { ConvexSync } from "./convex-sync";

// Configuration from environment
const PORT = Number(process.env.AGENT_GATEWAY_PORT) || 3100;
const CONVEX_URL = process.env.CONVEX_URL || "";
const PING_INTERVAL = 30000; // 30 seconds
const PRUNE_INTERVAL = 60000; // 60 seconds

const connections = new ConnectionManager();
const convexSync = CONVEX_URL ? new ConvexSync(CONVEX_URL) : null;

// Active sessions tracking (sessionId -> containerId)
const activeSessions = new Map<string, string>();

function handleContainerMessage(
  ws: { data: ContainerContext },
  message: ContainerToGatewayMessage
): void {
  switch (message.type) {
    case "register":
      connections.registerContainer(
        ws as Parameters<typeof connections.registerContainer>[0],
        message.container
      );
      if (convexSync) {
        convexSync.updateContainerStatus(
          message.container.containerId,
          message.container,
          "online"
        );
      }
      break;

    case "pong":
      if (ws.data.containerId) {
        connections.updateHealth(ws.data.containerId, message.health);
      }
      break;

    case "event":
      handleContainerEvent(ws.data.containerId, message);
      break;
  }
}

function handleContainerEvent(
  containerId: string | null,
  message: ContainerToGatewayMessage
): void {
  if (message.type !== "event" || !containerId) return;

  switch (message.event) {
    case "session_started":
      console.log(`[Gateway] Session started: ${message.sessionId} on ${containerId}`);
      activeSessions.set(message.sessionId, containerId);
      if (convexSync) {
        convexSync.updateSessionStatus(message.sessionId, "running");
      }
      break;

    case "session_output":
      console.log(`[Gateway] Session output: ${message.sessionId} (${message.output.type})`);
      if (convexSync) {
        convexSync.recordSessionOutput(message.sessionId, message.output);

        // Check if this is a result message
        if (isResultMessage(message.output)) {
          convexSync.recordSessionResult(message.sessionId, message.output);
        }
      }
      break;

    case "session_completed":
      console.log(`[Gateway] Session completed: ${message.sessionId}`);
      activeSessions.delete(message.sessionId);
      if (convexSync) {
        convexSync.recordSessionResult(message.sessionId, message.result);
      }
      break;

    case "session_error":
      console.error(`[Gateway] Session error: ${message.sessionId} - ${message.error}`);
      if (convexSync) {
        convexSync.updateSessionStatus(message.sessionId, "failed", {
          error: message.error,
          completedAt: Date.now(),
        });
      }
      break;
  }
}

// HTTP API for creating sessions (called by Convex or frontend)
async function handleHttpRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check
  if (url.pathname === "/health") {
    const stats = connections.getStats();
    return Response.json({ status: "ok", ...stats }, { headers: corsHeaders });
  }

  // List containers
  if (url.pathname === "/containers" && req.method === "GET") {
    const containers = connections.getAllContainers().map((c) => ({
      containerId: c.info.containerId,
      hostname: c.info.hostname,
      health: c.health,
      connectedAt: c.connectedAt,
    }));
    return Response.json({ containers }, { headers: corsHeaders });
  }

  // Create session
  if (url.pathname === "/sessions" && req.method === "POST") {
    try {
      const body = (await req.json()) as CreateSessionRequest;
      const { containerId, prompt, taskId, projectId, config } = body;

      const container = connections.getContainer(containerId);
      if (!container) {
        return Response.json(
          { error: "Container not found or offline" },
          { status: 404, headers: corsHeaders }
        );
      }

      const sessionId = crypto.randomUUID();

      // Record session in Convex
      if (convexSync) {
        await convexSync.createSession({
          sessionId,
          containerId,
          prompt,
          taskId,
          projectId,
        });
      }

      // Send command to container
      const sent = connections.sendToContainer(containerId, {
        type: "command",
        command: "start_session",
        sessionId,
        prompt,
        config,
      });

      if (!sent) {
        return Response.json(
          { error: "Failed to send command to container" },
          { status: 500, headers: corsHeaders }
        );
      }

      return Response.json(
        { sessionId, containerId, status: "starting" },
        { status: 201, headers: corsHeaders }
      );
    } catch (error) {
      console.error("[Gateway] Failed to create session:", error);
      return Response.json(
        { error: "Invalid request body" },
        { status: 400, headers: corsHeaders }
      );
    }
  }

  // Cancel session
  if (url.pathname.startsWith("/sessions/") && req.method === "DELETE") {
    const sessionId = url.pathname.split("/")[2];
    const containerId = activeSessions.get(sessionId);

    if (!containerId) {
      return Response.json(
        { error: "Session not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    connections.sendToContainer(containerId, {
      type: "command",
      command: "cancel_session",
      sessionId,
    });

    return Response.json({ status: "cancelling" }, { headers: corsHeaders });
  }

  return Response.json(
    { error: "Not found" },
    { status: 404, headers: corsHeaders }
  );
}

// Start the server
const server = Bun.serve({
  port: PORT,
  fetch: handleHttpRequest,
  websocket: {
    open(ws) {
      console.log("[Gateway] New WebSocket connection");
      ws.data = { containerId: null, registered: false };
      connections.addPendingSocket(ws);
    },

    message(ws, message) {
      try {
        const data = JSON.parse(message as string) as ContainerToGatewayMessage;
        handleContainerMessage(ws, data);
      } catch (error) {
        console.error("[Gateway] Failed to parse message:", error);
      }
    },

    close(ws) {
      if (ws.data.containerId) {
        console.log(`[Gateway] Container disconnected: ${ws.data.containerId}`);
        const container = connections.getContainer(ws.data.containerId);
        if (container && convexSync) {
          convexSync.updateContainerStatus(
            ws.data.containerId,
            container.info,
            "offline"
          );
        }
        connections.unregisterContainer(ws.data.containerId);
      } else {
        connections.removePendingSocket(ws);
      }
    },
  },
});

// Periodic ping to all containers
setInterval(() => {
  connections.pingAll();
}, PING_INTERVAL);

// Periodic pruning of stale connections
setInterval(() => {
  const pruned = connections.pruneStaleConnections();
  if (pruned.length > 0) {
    console.log(`[Gateway] Pruned ${pruned.length} stale connections`);
  }
}, PRUNE_INTERVAL);

console.log(`[Gateway] Agent Gateway started on port ${PORT}`);
console.log(`[Gateway] WebSocket: ws://localhost:${PORT}`);
console.log(`[Gateway] HTTP API: http://localhost:${PORT}`);
if (convexSync) {
  console.log(`[Gateway] Convex sync enabled`);
} else {
  console.log(`[Gateway] Convex sync disabled (no CONVEX_URL)`);
}

export { server };
