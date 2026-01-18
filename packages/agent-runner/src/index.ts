import type {
  ContainerInfo,
  GatewayToContainerMessage,
  ContainerToGatewayMessage,
  CliOutputMessage,
  ResultMessage,
  HealthStatus,
} from "@agent-manager/agent-shared";
import { isResultMessage } from "@agent-manager/agent-shared";
import { CliProcessManager } from "./cli-process";

// Configuration from environment
const GATEWAY_URL = process.env.AGENT_GATEWAY_URL || "ws://localhost:3100";
const CONTAINER_ID = process.env.CONTAINER_ID || crypto.randomUUID();
const HOSTNAME = process.env.HOSTNAME || "unknown";
const WORKING_DIR = process.env.AGENT_WORKING_DIR || process.cwd();
const RECONNECT_DELAY = 5000;
const PING_INTERVAL = 30000;

class AgentRunner {
  private ws: WebSocket | null = null;
  private cliManager: CliProcessManager;
  private startTime = Date.now();
  private lastError: string | undefined;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnecting = false;

  constructor() {
    this.cliManager = new CliProcessManager(
      this.handleCliOutput.bind(this),
      this.handleCliComplete.bind(this),
      this.handleCliError.bind(this)
    );
  }

  async start(): Promise<void> {
    console.log(`[AgentRunner] Starting with container ID: ${CONTAINER_ID}`);
    console.log(`[AgentRunner] Gateway URL: ${GATEWAY_URL}`);
    console.log(`[AgentRunner] Working directory: ${WORKING_DIR}`);

    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.reconnecting) return;

    try {
      console.log(`[AgentRunner] Connecting to gateway: ${GATEWAY_URL}`);
      this.ws = new WebSocket(GATEWAY_URL);

      this.ws.onopen = () => {
        console.log("[AgentRunner] Connected to gateway");
        this.reconnecting = false;
        this.register();
        this.startPingInterval();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };

      this.ws.onerror = (error) => {
        console.error("[AgentRunner] WebSocket error:", error);
        this.lastError = "WebSocket connection error";
      };

      this.ws.onclose = () => {
        console.log("[AgentRunner] Connection closed, reconnecting...");
        this.stopPingInterval();
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error("[AgentRunner] Failed to connect:", error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;

    setTimeout(() => {
      this.reconnecting = false;
      this.connect();
    }, RECONNECT_DELAY);
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      // Gateway will send pings, we just need to be ready to respond
    }, PING_INTERVAL);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private register(): void {
    const containerInfo: ContainerInfo = {
      containerId: CONTAINER_ID,
      hostname: HOSTNAME,
      workingDirectory: WORKING_DIR,
      capabilities: ["claude-code-cli"],
    };

    this.send({
      type: "register",
      container: containerInfo,
    });
  }

  private send(message: ContainerToGatewayMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("[AgentRunner] Cannot send, WebSocket not connected");
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as GatewayToContainerMessage;

      switch (message.command) {
        case "start_session":
          this.handleStartSession(message.sessionId, message.prompt, message.config);
          break;

        case "cancel_session":
          this.handleCancelSession(message.sessionId);
          break;

        case "send_input":
          // For future interactive sessions
          console.log(`[AgentRunner] Received input for session ${message.sessionId}`);
          break;

        case "ping":
          this.handlePing();
          break;
      }
    } catch (error) {
      console.error("[AgentRunner] Failed to parse message:", error);
    }
  }

  private async handleStartSession(
    sessionId: string,
    prompt: string,
    config?: { workingDirectory?: string; allowedTools?: string[]; maxTurns?: number }
  ): Promise<void> {
    console.log(`[AgentRunner] Starting session: ${sessionId}`);

    this.send({
      type: "event",
      event: "session_started",
      sessionId,
      timestamp: Date.now(),
    });

    try {
      await this.cliManager.startSession(sessionId, prompt, {
        workingDirectory: config?.workingDirectory || WORKING_DIR,
        ...config,
      });
    } catch (error) {
      this.send({
        type: "event",
        event: "session_error",
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
    }
  }

  private handleCancelSession(sessionId: string): void {
    console.log(`[AgentRunner] Cancelling session: ${sessionId}`);
    const cancelled = this.cliManager.cancelSession(sessionId);
    if (!cancelled) {
      console.warn(`[AgentRunner] Session ${sessionId} not found or already completed`);
    }
  }

  private handlePing(): void {
    const health: HealthStatus = {
      status: this.lastError ? "degraded" : "healthy",
      activeSessionCount: this.cliManager.getActiveSessions().length,
      uptime: Date.now() - this.startTime,
      lastError: this.lastError,
    };

    this.send({
      type: "pong",
      health,
    });
  }

  private handleCliOutput(sessionId: string, output: CliOutputMessage): void {
    this.send({
      type: "event",
      event: "session_output",
      sessionId,
      output,
      timestamp: Date.now(),
    });

    // If this is a result message, also send completion event
    if (isResultMessage(output)) {
      this.send({
        type: "event",
        event: "session_completed",
        sessionId,
        result: output,
        timestamp: Date.now(),
      });
    }
  }

  private handleCliComplete(sessionId: string, exitCode: number | null): void {
    console.log(`[AgentRunner] Session ${sessionId} completed with exit code: ${exitCode}`);

    // Clean up the session after a short delay
    setTimeout(() => {
      this.cliManager.removeSession(sessionId);
    }, 5000);
  }

  private handleCliError(sessionId: string, error: string): void {
    console.error(`[AgentRunner] Session ${sessionId} error:`, error);
    this.lastError = error;

    this.send({
      type: "event",
      event: "session_error",
      sessionId,
      error,
      timestamp: Date.now(),
    });
  }
}

// Start the agent runner
const runner = new AgentRunner();
runner.start().catch(console.error);
