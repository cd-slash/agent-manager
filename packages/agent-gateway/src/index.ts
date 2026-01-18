/**
 * Agent Gateway
 *
 * Central WebSocket server that container API instances connect to.
 * Provides HTTP API for the frontend to interact with containers.
 * Syncs execution events to Convex for persistence and real-time updates.
 */

import type { ServerWebSocket } from "bun";
import type {
  WebSocketMessage,
  ConnectPayload,
  HeartbeatPayload,
  ExecStartPayload,
  ExecStreamPayload,
  ExecCompletePayload,
  StatusHealthPayload,
  AuthStatusPayload,
  CreateContainerRequest,
} from "@agent-manager/agent-shared";
import { parseMessage, isConnectMessage } from "@agent-manager/agent-shared";
import { ConnectionManager, type ContainerContext } from "./connections";
import { ConvexSync } from "./convex-sync";

// Configuration from environment
const PORT = Number(process.env.AGENT_GATEWAY_PORT) || 3100;
const CONVEX_URL = process.env.CONVEX_URL || "";
const SERVER_ID = process.env.SERVER_ID || `gateway-${crypto.randomUUID().slice(0, 8)}`;
const PING_INTERVAL = 30000; // 30 seconds
const PRUNE_INTERVAL = 60000; // 60 seconds

const connections = new ConnectionManager(SERVER_ID);
const convexSync = CONVEX_URL ? new ConvexSync(CONVEX_URL) : null;

// Active executions tracking (correlationId -> { containerId, taskId, projectId })
const activeExecutions = new Map<
  string,
  { containerId: string; taskId?: string; projectId?: string; startedAt: number }
>();

/**
 * Handle incoming WebSocket messages from containers
 */
function handleContainerMessage(
  ws: ServerWebSocket<ContainerContext>,
  message: WebSocketMessage
): void {
  // Handle connect (registration)
  if (isConnectMessage(message)) {
    const payload = message.payload as ConnectPayload;
    connections.registerContainer(ws, payload);

    // Update Convex with container status
    if (convexSync) {
      convexSync.updateContainerConnection(payload.containerId, payload.hostname, true);
    }
    return;
  }

  // All other messages require registration
  if (!ws.data.registered || !ws.data.containerId) {
    console.warn("[gateway] Received message from unregistered container");
    return;
  }

  const containerId = ws.data.containerId;

  switch (message.type) {
    case "heartbeat": {
      const payload = message.payload as HeartbeatPayload;
      connections.updateHeartbeat(containerId);
      // Echo heartbeat back
      connections.send(ws, "heartbeat", { seq: payload.seq, sentAt: Date.now() });
      break;
    }

    case "status:health": {
      const payload = message.payload as StatusHealthPayload;
      connections.updateHealth(containerId, payload);
      break;
    }

    case "auth:status": {
      const payload = message.payload as AuthStatusPayload;
      console.log(`[gateway] Auth status from ${containerId}:`, payload);
      // Could sync to Convex if needed
      break;
    }

    case "exec:stream": {
      const payload = message.payload as ExecStreamPayload;
      handleExecStream(containerId, payload, message.correlationId);
      break;
    }

    case "exec:complete": {
      const payload = message.payload as ExecCompletePayload;
      handleExecComplete(containerId, payload, message.correlationId);
      break;
    }

    default:
      console.log(`[gateway] Unhandled message type: ${message.type}`);
  }
}

/**
 * Handle streaming execution output
 */
function handleExecStream(
  containerId: string,
  payload: ExecStreamPayload,
  correlationId?: string
): void {
  const execution = correlationId ? activeExecutions.get(correlationId) : null;

  // Log stream events
  console.log(
    `[gateway] Stream from ${containerId}:`,
    payload.streamType,
    payload.data.type
  );

  // Sync to Convex
  if (convexSync && execution) {
    convexSync.recordStreamEvent(
      correlationId!,
      containerId,
      payload,
      execution.taskId,
      execution.projectId
    );
  }
}

/**
 * Handle execution completion
 */
function handleExecComplete(
  containerId: string,
  payload: ExecCompletePayload,
  correlationId?: string
): void {
  const execution = correlationId ? activeExecutions.get(correlationId) : null;

  console.log(
    `[gateway] Execution complete from ${containerId}:`,
    payload.result,
    payload.sessionId ? `session=${payload.sessionId}` : ""
  );

  // Sync to Convex
  if (convexSync && execution) {
    convexSync.recordExecComplete(
      correlationId!,
      containerId,
      payload,
      execution.taskId,
      execution.projectId
    );
  }

  // Clean up
  if (correlationId) {
    activeExecutions.delete(correlationId);
  }
}

/**
 * Start an execution on a container
 */
function startExecution(
  containerId: string,
  options: ExecStartPayload
): { correlationId: string; success: boolean; error?: string } {
  const container = connections.getContainer(containerId);
  if (!container) {
    return { correlationId: "", success: false, error: "Container not found" };
  }

  const correlationId = crypto.randomUUID();

  // Track the execution
  activeExecutions.set(correlationId, {
    containerId,
    taskId: options.taskId,
    projectId: options.projectId,
    startedAt: Date.now(),
  });

  // Send exec:start to container
  const sent = connections.sendToContainer(
    containerId,
    "exec:start",
    options,
    correlationId
  );

  if (!sent) {
    activeExecutions.delete(correlationId);
    return { correlationId, success: false, error: "Failed to send to container" };
  }

  // Record in Convex
  if (convexSync) {
    convexSync.recordExecStart(
      correlationId,
      containerId,
      options,
      options.taskId,
      options.projectId
    );
  }

  return { correlationId, success: true };
}

/**
 * HTTP API handler
 */
async function handleHttpRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check
  if (url.pathname === "/health") {
    const stats = connections.getStats();
    return Response.json(
      { status: "ok", serverId: SERVER_ID, ...stats },
      { headers: corsHeaders }
    );
  }

  // List connected containers
  if (url.pathname === "/containers" && req.method === "GET") {
    const containers = connections.getAllContainers().map((c) => ({
      containerId: c.info.containerId,
      hostname: c.info.hostname,
      version: c.info.version,
      capabilities: c.info.capabilities,
      health: c.health,
      connectedAt: c.connectedAt,
      lastHeartbeat: c.lastHeartbeat,
    }));
    return Response.json({ containers }, { headers: corsHeaders });
  }

  // Get specific container
  if (url.pathname.match(/^\/containers\/[^/]+$/) && req.method === "GET") {
    const containerId = url.pathname.split("/")[2];
    const container = connections.getContainer(containerId!);
    if (!container) {
      return Response.json(
        { error: "Container not found" },
        { status: 404, headers: corsHeaders }
      );
    }
    return Response.json(
      {
        containerId: container.info.containerId,
        hostname: container.info.hostname,
        version: container.info.version,
        capabilities: container.info.capabilities,
        health: container.health,
        connectedAt: container.connectedAt,
        lastHeartbeat: container.lastHeartbeat,
      },
      { headers: corsHeaders }
    );
  }

  // Start execution on a container
  if (url.pathname === "/exec" && req.method === "POST") {
    try {
      const body = (await req.json()) as ExecStartPayload & { containerId?: string };
      const { containerId, ...options } = body;

      // Find container (specific or available)
      let targetContainerId = containerId;
      if (!targetContainerId) {
        const available = connections.findAvailableContainer();
        if (!available) {
          return Response.json(
            { error: "No available containers" },
            { status: 503, headers: corsHeaders }
          );
        }
        targetContainerId = available.info.containerId;
      }

      const result = startExecution(targetContainerId, options);

      if (!result.success) {
        return Response.json(
          { error: result.error },
          { status: 400, headers: corsHeaders }
        );
      }

      return Response.json(
        {
          correlationId: result.correlationId,
          containerId: targetContainerId,
          status: "started",
        },
        { status: 201, headers: corsHeaders }
      );
    } catch (error) {
      console.error("[gateway] Failed to start execution:", error);
      return Response.json(
        { error: "Invalid request body" },
        { status: 400, headers: corsHeaders }
      );
    }
  }

  // Abort execution
  if (url.pathname.match(/^\/exec\/[^/]+\/abort$/) && req.method === "POST") {
    const correlationId = url.pathname.split("/")[2];
    const execution = activeExecutions.get(correlationId!);

    if (!execution) {
      return Response.json(
        { error: "Execution not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // TODO: Send abort message to container
    // connections.sendToContainer(execution.containerId, "exec:abort", { processId: ? });

    return Response.json({ status: "abort_requested" }, { headers: corsHeaders });
  }

  // Push auth token to container
  if (url.pathname.match(/^\/containers\/[^/]+\/auth$/) && req.method === "POST") {
    const containerId = url.pathname.split("/")[2];
    try {
      const { token } = (await req.json()) as { token: string };

      const sent = connections.sendToContainer(containerId!, "auth:request", { token });

      if (!sent) {
        return Response.json(
          { error: "Container not found or not connected" },
          { status: 404, headers: corsHeaders }
        );
      }

      return Response.json({ status: "token_sent" }, { headers: corsHeaders });
    } catch {
      return Response.json(
        { error: "Invalid request" },
        { status: 400, headers: corsHeaders }
      );
    }
  }

  // Create container (calls create-agent script)
  if (url.pathname === "/containers/create" && req.method === "POST") {
    try {
      const body = (await req.json()) as CreateContainerRequest;

      if (!body.repo) {
        return Response.json(
          { error: "repo is required" },
          { status: 400, headers: corsHeaders }
        );
      }

      // Build command arguments - script is in packages/agent-gateway/bin/
      const scriptPath = new URL("../bin/create-agent", import.meta.url).pathname;
      const args = [scriptPath, "--repo", body.repo, "--quiet"];
      if (body.branch) args.push("--branch", body.branch);
      if (body.name) args.push("--name", body.name);
      if (body.server) args.push("--server", body.server);

      console.log("[gateway] Creating container:", args.join(" "));

      const proc = Bun.spawn(["bash", ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        console.error("[gateway] Container creation failed:", stderr);
        return Response.json(
          { error: "Container creation failed", details: stderr },
          { status: 500, headers: corsHeaders }
        );
      }

      const result = JSON.parse(stdout);

      // Record in Convex
      if (convexSync) {
        convexSync.recordContainerCreated(result, body.taskId, body.projectId);
      }

      return Response.json(result, { status: 201, headers: corsHeaders });
    } catch (error) {
      console.error("[gateway] Failed to create container:", error);
      return Response.json(
        { error: "Failed to create container" },
        { status: 500, headers: corsHeaders }
      );
    }
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
    open(ws: ServerWebSocket<ContainerContext>) {
      console.log("[gateway] New WebSocket connection");
      ws.data = { containerId: null, registered: false };
      connections.addPendingSocket(ws);
    },

    message(ws: ServerWebSocket<ContainerContext>, message: string | Buffer) {
      try {
        const data = parseMessage(message.toString());
        handleContainerMessage(ws, data);
      } catch (error) {
        console.error("[gateway] Failed to parse message:", error);
      }
    },

    close(ws: ServerWebSocket<ContainerContext>) {
      if (ws.data.containerId) {
        console.log(`[gateway] Container disconnected: ${ws.data.containerId}`);
        if (convexSync) {
          convexSync.updateContainerConnection(ws.data.containerId, "", false);
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
    console.log(`[gateway] Pruned ${pruned.length} stale connections`);
    // Update Convex for pruned containers
    if (convexSync) {
      for (const containerId of pruned) {
        convexSync.updateContainerConnection(containerId, "", false);
      }
    }
  }
}, PRUNE_INTERVAL);

console.log(`[gateway] Agent Gateway started`);
console.log(`[gateway]   Server ID: ${SERVER_ID}`);
console.log(`[gateway]   WebSocket: ws://localhost:${PORT}`);
console.log(`[gateway]   HTTP API:  http://localhost:${PORT}`);
if (convexSync) {
  console.log(`[gateway]   Convex:    enabled`);
} else {
  console.log(`[gateway]   Convex:    disabled (set CONVEX_URL to enable)`);
}

export { server };
