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
  CreateContainerResult,
} from "@agent-manager/agent-shared";
import { parseMessage, isConnectMessage } from "@agent-manager/agent-shared";
import { ConnectionManager, type ContainerContext } from "./connections";
import { ConvexSync } from "./convex-sync";

// 3-letter words for random name generation
const WORDS = [
  "ace", "act", "add", "age", "ago", "aid", "aim", "air", "all", "ant", "ape", "apt", "arc", "are", "ark", "arm", "art", "ash",
  "ask", "ate", "awe", "axe", "bad", "bag", "ban", "bar", "bat", "bay", "bed", "bee", "beg", "bet", "bid", "big", "bin", "bit",
  "bog", "bow", "box", "boy", "bud", "bug", "bun", "bus", "but", "buy", "cab", "can", "cap", "car", "cat", "cob", "cod", "cog",
  "cop", "cot", "cow", "cry", "cub", "cud", "cup", "cur", "cut", "dab", "dad", "dam", "day", "den", "dew", "did", "die", "dig",
  "dim", "dip", "doe", "dog", "dot", "dry", "dub", "dud", "due", "dug", "dye", "ear", "eat", "eel", "egg", "ego", "elf", "elk",
  "elm", "emu", "end", "era", "eve", "ewe", "eye", "fab", "fad", "fan", "far", "fat", "fax", "fed", "fee", "few", "fig", "fin",
  "fir", "fit", "fix", "fly", "foe", "fog", "for", "fox", "fry", "fun", "fur", "gag", "gap", "gas", "gel", "gem", "get", "gig",
  "gin", "god", "got", "gum", "gun", "gut", "guy", "gym", "had", "ham", "has", "hat", "hay", "hem", "hen", "her", "hid", "him",
  "hip", "his", "hit", "hob", "hog", "hop", "hot", "how", "hub", "hue", "hug", "hum", "hut", "ice", "icy", "ill", "imp", "ink",
  "inn", "ion", "ire", "irk", "ivy", "jab", "jag", "jam", "jar", "jaw", "jay", "jet", "jig", "job", "jog", "jot", "joy", "jug",
  "jut", "keg", "ken", "key", "kid", "kin", "kit", "lab", "lac", "lad", "lag", "lap", "law", "lax", "lay", "lea", "led", "leg",
  "let", "lid", "lie", "lip", "lit", "log", "lop", "lot", "low", "lug", "mad", "man", "map", "mar", "mat", "maw", "max", "may",
  "men", "met", "mid", "mix", "mob", "mod", "mom", "mop", "mow", "mud", "mug", "mum", "nab", "nag", "nap", "nay", "net", "new",
  "nip", "nit", "nob", "nod", "nor", "not", "now", "nub", "nun", "nut", "oak", "oar", "oat", "odd", "ode", "off", "oft", "oil",
  "old", "one", "opt", "orb", "ore", "our", "out", "ova", "owe", "owl", "own", "pad", "pal", "pan", "pap", "par", "pat", "paw",
  "pay", "pea", "peg", "pen", "pep", "per", "pet", "pew", "pie", "pig", "pin", "pit", "ply", "pod", "pop", "pot", "pow", "pox",
  "pro", "pry", "pub", "pug", "pun", "pup", "put", "quo", "rag", "ram", "ran", "rap", "rat", "raw", "ray", "red", "ref", "rib",
  "rid", "rig", "rim", "rip", "rob", "rod", "roe", "rot", "row", "rub", "rug", "run", "rut", "rye", "sac", "sad", "sag", "sap",
  "sat", "saw", "say", "sea", "set", "sew", "she", "shy", "sin", "sip", "sir", "sit", "six", "ski", "sky", "sly", "sob", "sod",
  "son", "sop", "sot", "sow", "soy", "spa", "spy", "sty", "sub", "sue", "sum", "sun", "sup", "tab", "tad", "tag", "tan", "tap",
  "tar", "tat", "tax", "tea", "ten", "the", "thy", "tic", "tie", "tin", "tip", "tit", "toe", "tog", "tom", "ton", "too", "top",
  "tot", "tow", "toy", "try", "tub", "tug", "two", "urn", "use", "van", "vat", "vet", "vex", "via", "vie", "vim", "vow", "wad",
  "wag", "war", "was", "wax", "way", "web", "wed", "wee", "wet", "who", "wig", "win", "wit", "woe", "wok", "won", "woo", "wow",
  "yak", "yam", "yap", "yaw", "yea", "yen", "yes", "yet", "yew", "yon", "you", "zap", "zed", "zen", "zip", "zit", "zoo",
];

/**
 * Generate a random 3-word name (e.g., "tar-bat-sag")
 */
function generateRandomName(): string {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${pick()}-${pick()}-${pick()}`;
}

/**
 * Generate a unique WireGuard port from hostname hash (range: 42000-42999)
 */
function generateWgPort(hostname: string): number {
  const hash = new Bun.CryptoHasher("sha1").update(hostname).digest("hex");
  return 42000 + (parseInt(hash.slice(0, 4), 16) % 1000);
}

/**
 * Fetch secrets from Convex
 */
async function fetchSecrets(
  convexUrl: string,
  keys: string[]
): Promise<Record<string, string>> {
  const response = await fetch(`${convexUrl}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "secrets:getMultiple",
      args: { keys },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch secrets: ${response.statusText}`);
  }

  const result = await response.json();
  return result.value || {};
}

/**
 * Create a container on a remote server using inline SSH
 */
async function createContainerOnServer(
  request: CreateContainerRequest,
  secrets: Record<string, string>
): Promise<CreateContainerResult> {
  const { repo, branch = "main", name, server = "localhost" } = request;
  const containerName = name || generateRandomName();
  const wgPort = generateWgPort(containerName);

  // Inline Dockerfile (self-contained, no monorepo needed)
  const dockerfile = `FROM debian:bookworm-slim
ARG TZ=UTC
ARG GH_USERNAME
ARG GH_TOKEN
ENV TZ=$TZ GH_USERNAME=$GH_USERNAME GH_TOKEN=$GH_TOKEN
ENV SHELL=/bin/bash HOME=/root
ENV PATH="/root/.bun/bin:/root/.local/bin:$PATH"

# Base packages
RUN apt-get update && apt-get install -y --no-install-recommends \\
    ca-certificates curl git gnupg iptables openssh-server procps tini tmux \\
    && rm -rf /var/lib/apt/lists/*

# Tailscale
RUN curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \\
    | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null && \\
    curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list \\
    | tee /etc/apt/sources.list.d/tailscale.list && \\
    apt-get update && apt-get install -y tailscale && rm -rf /var/lib/apt/lists/*

# SSH config
RUN mkdir -p /var/run/sshd /root/.ssh && chsh -s /bin/bash root

# Bun
RUN curl -fsSL https://bun.sh/install | bash && ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Claude CLI
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \\
    apt-get install -y nodejs && rm -rf /var/lib/apt/lists/* && \\
    npm install -g @anthropic-ai/claude-code

# Prepare container-api directory (binary SCP'd after container start)
RUN mkdir -p /opt/container-api

RUN mkdir -p /workspace
WORKDIR /workspace`;

  // Inline entrypoint script
  const entrypoint = `#!/bin/bash
set -euo pipefail

# Start Tailscale
if [ -n "\${TS_AUTHKEY:-}" ]; then
  TAILSCALED_ARGS="--state=/var/lib/tailscale/tailscaled.state"
  [ -n "\${TS_WG_PORT:-}" ] && TAILSCALED_ARGS="$TAILSCALED_ARGS --port=\${TS_WG_PORT}"
  tailscaled $TAILSCALED_ARGS &
  sleep 2
  tailscale up --authkey="\${TS_AUTHKEY}" --hostname="\${TS_HOSTNAME}" --accept-dns=true --ssh
fi

# Start SSH
/usr/sbin/sshd

# Clone workspace
if [ -n "\${WORKSPACE_REPO:-}" ] && [ ! -d "/workspace/.git" ]; then
  git clone --depth 1 --branch "\${WORKSPACE_BRANCH:-main}" \\
    "https://\${GH_USERNAME}:\${GH_TOKEN}@github.com/\${WORKSPACE_REPO}.git" /workspace || \\
  git clone --depth 1 "https://\${GH_USERNAME}:\${GH_TOKEN}@github.com/\${WORKSPACE_REPO}.git" /workspace
  cd /workspace && [ -f package.json ] && bun install
fi

exec "\$@"`;

  const composeYml = `services:
  server:
    build:
      context: /tmp/agent-build
      args:
        GH_USERNAME: ${secrets.GH_USERNAME}
        GH_TOKEN: ${secrets.GH_TOKEN}
    hostname: ${containerName}
    container_name: ${containerName}
    environment:
      - TS_AUTHKEY=${secrets.TS_AUTHKEY}
      - TS_HOSTNAME=${containerName}
      - TS_WG_PORT=${wgPort}
      - WORKSPACE_REPO=${repo}
      - WORKSPACE_BRANCH=${branch}
      - GH_USERNAME=${secrets.GH_USERNAME}
      - GH_TOKEN=${secrets.GH_TOKEN}
      - MANAGER_WS_URL=${secrets.MANAGER_WS_URL}
    devices:
      - /dev/net/tun:/dev/net/tun
    cap_add:
      - net_admin
    ports:
      - "${wgPort}:${wgPort}/udp"
    restart: unless-stopped
    mem_limit: 4096m`;

  const binaryPath = new URL("../container-api-binary", import.meta.url).pathname;

  // Step 1: Build and start container (without binary)
  const buildScript = `set -e
BUILD_DIR="/tmp/agent-build"
rm -rf "$BUILD_DIR" && mkdir -p "$BUILD_DIR"

cat > "$BUILD_DIR/Dockerfile" << 'DOCKERFILE'
${dockerfile}
DOCKERFILE

cat > "$BUILD_DIR/entrypoint.sh" << 'ENTRYPOINT'
${entrypoint}
ENTRYPOINT
chmod +x "$BUILD_DIR/entrypoint.sh"

echo 'COPY entrypoint.sh /entrypoint.sh' >> "$BUILD_DIR/Dockerfile"
echo 'ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]' >> "$BUILD_DIR/Dockerfile"
echo 'CMD ["bash"]' >> "$BUILD_DIR/Dockerfile"

cat > /tmp/compose-${containerName}.yml << 'COMPOSE'
${composeYml}
COMPOSE

docker compose -f /tmp/compose-${containerName}.yml --project-name ${containerName} up --build -d
rm -rf "$BUILD_DIR" /tmp/compose-${containerName}.yml`;

  console.log(`[gateway] Creating container ${containerName} on ${server}...`);

  // Execute build script on server
  const buildProc = server === "localhost"
    ? Bun.spawn(["bash", "-c", buildScript], { stdout: "pipe", stderr: "pipe" })
    : Bun.spawn(["ssh", server, "bash", "-s"], {
        stdin: new Blob([buildScript]),
        stdout: "pipe",
        stderr: "pipe",
      });

  const buildStderr = await new Response(buildProc.stderr).text();
  const buildExit = await buildProc.exited;

  if (buildExit !== 0) {
    throw new Error(`Container build failed: ${buildStderr}`);
  }

  console.log(`[gateway] Container ${containerName} started, waiting for Tailscale...`);

  // Step 2: Wait for container to be running
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Step 3: SCP binary to the server, then docker cp into container
  console.log(`[gateway] Copying container-api binary...`);

  // Check if binary exists
  const binaryFile = Bun.file(binaryPath);
  if (!(await binaryFile.exists())) {
    console.warn(`[gateway] Binary not found at ${binaryPath}, skipping SCP`);
  } else {
    if (server === "localhost") {
      // Direct docker cp for localhost
      const copyProc = Bun.spawn([
        "bash", "-c",
        `docker cp "${binaryPath}" ${containerName}:/opt/container-api/container-api && \
         docker exec ${containerName} chmod +x /opt/container-api/container-api`
      ], { stdout: "pipe", stderr: "pipe" });
      await copyProc.exited;
    } else {
      // SCP to server, then docker cp
      const scpProc = Bun.spawn(["scp", binaryPath, `${server}:/tmp/container-api-binary`], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await scpProc.exited;

      const copyScript = `docker cp /tmp/container-api-binary ${containerName}:/opt/container-api/container-api && \
docker exec ${containerName} chmod +x /opt/container-api/container-api && \
rm /tmp/container-api-binary`;

      const copyProc = Bun.spawn(["ssh", server, "bash", "-c", copyScript], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await copyProc.exited;
    }

    // Step 4: Start container-api inside the container
    console.log(`[gateway] Starting container-api...`);

    const startCommand = `docker exec -d ${containerName} bash -c 'PORT=4096 /opt/container-api/container-api &' && \
sleep 2 && \
docker exec ${containerName} tailscale serve --bg --http 80 http://localhost:4096 2>/dev/null || true`;

    const startProc = server === "localhost"
      ? Bun.spawn(["bash", "-c", startCommand], { stdout: "pipe", stderr: "pipe" })
      : Bun.spawn(["ssh", server, "bash", "-c", startCommand], { stdout: "pipe", stderr: "pipe" });

    await startProc.exited;
  }

  console.log(`[gateway] Container ${containerName} ready!`);

  return {
    name: containerName,
    containerId: containerName,
    hostname: containerName,
    repo,
    branch,
    server,
    network: "bridge",
    wgPort,
  };
}

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

  // Create container (inline SSH with secrets from Convex)
  if (url.pathname === "/containers/create" && req.method === "POST") {
    try {
      const body = (await req.json()) as CreateContainerRequest;

      if (!body.repo) {
        return Response.json(
          { error: "repo is required" },
          { status: 400, headers: corsHeaders }
        );
      }

      console.log("[gateway] Creating container for repo:", body.repo);

      // Fetch secrets from Convex
      if (!CONVEX_URL) {
        return Response.json(
          { error: "CONVEX_URL not configured - cannot fetch secrets" },
          { status: 500, headers: corsHeaders }
        );
      }

      const secrets = await fetchSecrets(CONVEX_URL, [
        "TS_AUTHKEY",
        "GH_USERNAME",
        "GH_TOKEN",
        "MANAGER_WS_URL",
      ]);

      // Validate required secrets
      const requiredSecrets = ["TS_AUTHKEY", "GH_USERNAME", "GH_TOKEN"];
      const missingSecrets = requiredSecrets.filter((key) => !secrets[key]);
      if (missingSecrets.length > 0) {
        return Response.json(
          { error: `Missing required secrets: ${missingSecrets.join(", ")}` },
          { status: 500, headers: corsHeaders }
        );
      }

      // Default MANAGER_WS_URL if not set
      if (!secrets.MANAGER_WS_URL) {
        secrets.MANAGER_WS_URL = `ws://localhost:${PORT}`;
      }

      const result = await createContainerOnServer(body, secrets);

      // Record in Convex
      if (convexSync) {
        convexSync.recordContainerCreated(result, body.taskId, body.projectId);
      }

      return Response.json(result, { status: 201, headers: corsHeaders });
    } catch (error) {
      console.error("[gateway] Failed to create container:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json(
        { error: "Failed to create container", details: message },
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
