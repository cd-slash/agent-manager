/**
 * WebSocket Integration
 *
 * Wires up the WebSocket connection to the existing managers.
 * Handles incoming commands and pushes status updates.
 */

import { ManagerConnection } from "./manager-connection";
import { AuthManager } from "./auth-manager";
import { ProcessManager } from "./process-manager";
import { SessionManager } from "./session-manager";
import {
  type ExecStartPayload,
  type ExecAbortPayload,
  type AuthRequestPayload,
  type AuthFlowStartPayload,
  type AuthFlowCompletePayload,
  type SessionListPayload,
  type SessionDeletePayload,
  type ExecStreamPayload,
  type ExecCompletePayload,
  type AuthStatusPayload,
  type StatusHealthPayload,
  type StatusProcessPayload,
  type SessionDataPayload,
  type AuthFlowUrlPayload,
  type ErrorPayload,
} from "./protocol";

interface WebSocketIntegrationConfig {
  managerUrl: string;
  containerId: string;
  hostname: string;
}

export class WebSocketIntegration {
  private connection: ManagerConnection;
  private authManager: AuthManager;
  private processManager: ProcessManager;
  private sessionManager: SessionManager;
  private startTime: number;

  constructor(
    config: WebSocketIntegrationConfig,
    authManager: AuthManager,
    processManager: ProcessManager,
    sessionManager: SessionManager
  ) {
    this.connection = new ManagerConnection({
      managerUrl: config.managerUrl,
      containerId: config.containerId,
      hostname: config.hostname,
    });
    this.authManager = authManager;
    this.processManager = processManager;
    this.sessionManager = sessionManager;
    this.startTime = Date.now();

    this.setupMessageHandlers();
    this.setupEventForwarding();
  }

  /**
   * Connect to the manager
   */
  async connect(): Promise<void> {
    await this.connection.connect();

    // Send initial status after connecting
    await this.pushHealthStatus();
    await this.pushAuthStatus();
    await this.pushProcessStatus();
  }

  /**
   * Disconnect from the manager
   */
  async disconnect(): Promise<void> {
    await this.connection.disconnect();
  }

  /**
   * Get the connection state with additional info
   */
  getState(): { state: string; connected: boolean; managerUrl: string } {
    const state = this.connection.getState();
    return {
      state,
      connected: state === "connected",
      managerUrl: this.connection.getManagerUrl(),
    };
  }

  /**
   * Set up handlers for incoming messages
   */
  private setupMessageHandlers(): void {
    // Execution commands
    this.connection.onMessage<ExecStartPayload>("exec:start", async (payload, msg) => {
      console.log(`[ws] Received exec:start: ${payload.message.substring(0, 50)}...`);
      await this.handleExecStart(payload, msg.correlationId);
    });

    this.connection.onMessage<ExecAbortPayload>("exec:abort", async (payload, msg) => {
      console.log(`[ws] Received exec:abort: ${payload.processId}`);
      await this.handleExecAbort(payload, msg.correlationId);
    });

    // Authentication commands
    this.connection.onMessage<AuthRequestPayload>("auth:request", async (payload, msg) => {
      console.log("[ws] Received auth:request");
      await this.handleAuthRequest(payload, msg.correlationId);
    });

    this.connection.onMessage<AuthFlowStartPayload>("auth:flow:start", async (_, msg) => {
      console.log("[ws] Received auth:flow:start");
      await this.handleAuthFlowStart(msg.correlationId);
    });

    this.connection.onMessage<AuthFlowCompletePayload>("auth:flow:complete", async (payload, msg) => {
      console.log(`[ws] Received auth:flow:complete: ${payload.flowId}`);
      await this.handleAuthFlowComplete(payload, msg.correlationId);
    });

    // Session commands
    this.connection.onMessage<SessionListPayload>("session:list", async (_, msg) => {
      console.log("[ws] Received session:list");
      await this.handleSessionList(msg.correlationId);
    });

    this.connection.onMessage<SessionDeletePayload>("session:delete", async (payload, msg) => {
      console.log(`[ws] Received session:delete: ${payload.sessionId}`);
      await this.handleSessionDelete(payload, msg.correlationId);
    });
  }

  /**
   * Set up event forwarding from managers to WebSocket
   */
  private setupEventForwarding(): void {
    // Forward auth changes
    this.authManager.on("auth:changed", async () => {
      await this.pushAuthStatus();
    });

    // Forward process events
    this.processManager.on("process:started", (data: { processId: number }) => {
      this.pushProcessStatus();
    });

    this.processManager.on("process:completed", (data: { processId: number }) => {
      this.pushProcessStatus();
    });

    this.processManager.on("process:error", (data: { processId: number }) => {
      this.pushProcessStatus();
    });
  }

  // ==========================================================================
  // Message Handlers
  // ==========================================================================

  private async handleExecStart(payload: ExecStartPayload, correlationId?: string): Promise<void> {
    // Track the current process ID for this execution
    let currentProcessId = 0;

    try {
      // Stream execution output
      for await (const event of this.processManager.executeStream({
        message: payload.message,
        model: payload.model,
        sessionId: payload.sessionId,
        systemPrompt: payload.systemPrompt,
        appendSystemPrompt: payload.appendSystemPrompt,
        allowedTools: payload.allowedTools,
        disallowedTools: payload.disallowedTools,
        maxBudget: payload.maxBudget,
        permissionMode: payload.permissionMode,
        workingDirectory: payload.workingDirectory,
        addDir: payload.addDir,
      })) {
        switch (event.type) {
          case "start":
            // Capture and send process ID
            currentProcessId = event.processId!;
            const streamStart: ExecStreamPayload = {
              processId: currentProcessId,
              streamType: "system",
              data: { type: "start", session_id: undefined },
            };
            this.connection.send("exec:stream", streamStart, correlationId);
            break;

          case "data":
            // Forward stream data with tracked process ID
            const streamData: ExecStreamPayload = {
              processId: currentProcessId,
              streamType: event.data!.type as ExecStreamPayload["streamType"],
              data: event.data!,
            };
            this.connection.send("exec:stream", streamData, correlationId);
            break;

          case "done":
            // Send completion
            const complete: ExecCompletePayload = {
              processId: currentProcessId,
              result: "success",
            };
            this.connection.send("exec:complete", complete, correlationId);
            break;

          case "error":
            // Send error
            const error: ExecCompletePayload = {
              processId: currentProcessId,
              result: "error",
              error: event.error,
              exitCode: event.exitCode,
            };
            this.connection.send("exec:complete", error, correlationId);
            break;
        }
      }
    } catch (error) {
      const errorPayload: ErrorPayload = {
        code: "EXEC_FAILED",
        message: error instanceof Error ? error.message : String(error),
      };
      this.connection.send("error", errorPayload, correlationId);
    }
  }

  private async handleExecAbort(payload: ExecAbortPayload, correlationId?: string): Promise<void> {
    const success = this.processManager.abort(payload.processId);
    this.connection.send("exec:aborted", { processId: payload.processId, success }, correlationId);
  }

  private async handleAuthRequest(payload: AuthRequestPayload, correlationId?: string): Promise<void> {
    try {
      await this.authManager.setToken(payload.token);
      await this.pushAuthStatus();
    } catch (error) {
      const errorPayload: ErrorPayload = {
        code: "AUTH_FAILED",
        message: error instanceof Error ? error.message : String(error),
      };
      this.connection.send("error", errorPayload, correlationId);
    }
  }

  private async handleAuthFlowStart(correlationId?: string): Promise<void> {
    try {
      const result = await this.authManager.startOAuthFlow();
      const payload: AuthFlowUrlPayload = {
        flowId: result.flowId,
        url: result.url,
        expiresIn: result.expiresIn,
      };
      this.connection.send("auth:flow:url", payload, correlationId);
    } catch (error) {
      const errorPayload: ErrorPayload = {
        code: "AUTH_FLOW_FAILED",
        message: error instanceof Error ? error.message : String(error),
      };
      this.connection.send("error", errorPayload, correlationId);
    }
  }

  private async handleAuthFlowComplete(payload: AuthFlowCompletePayload, correlationId?: string): Promise<void> {
    try {
      const result = await this.authManager.completeOAuthFlow(payload.flowId, payload.code);
      if (result.success) {
        await this.pushAuthStatus();
      } else {
        const errorPayload: ErrorPayload = {
          code: "AUTH_FLOW_FAILED",
          message: "OAuth flow failed to complete",
        };
        this.connection.send("error", errorPayload, correlationId);
      }
    } catch (error) {
      const errorPayload: ErrorPayload = {
        code: "AUTH_FLOW_FAILED",
        message: error instanceof Error ? error.message : String(error),
      };
      this.connection.send("error", errorPayload, correlationId);
    }
  }

  private async handleSessionList(correlationId?: string): Promise<void> {
    try {
      const sessions = await this.sessionManager.listSessions();
      const payload: SessionDataPayload = {
        sessions: sessions.map((s) => ({
          id: s.id,
          project: s.project,
          createdAt: s.createdAt.toISOString(),
          lastAccessedAt: s.lastAccessedAt.toISOString(),
        })),
      };
      this.connection.send("session:data", payload, correlationId);
    } catch (error) {
      const errorPayload: ErrorPayload = {
        code: "SESSION_LIST_FAILED",
        message: error instanceof Error ? error.message : String(error),
      };
      this.connection.send("error", errorPayload, correlationId);
    }
  }

  private async handleSessionDelete(payload: SessionDeletePayload, correlationId?: string): Promise<void> {
    try {
      const deleted = await this.sessionManager.deleteSession(payload.sessionId);
      const response: SessionDataPayload = {
        deleted: deleted ? payload.sessionId : undefined,
      };
      this.connection.send("session:data", response, correlationId);
    } catch (error) {
      const errorPayload: ErrorPayload = {
        code: "SESSION_DELETE_FAILED",
        message: error instanceof Error ? error.message : String(error),
      };
      this.connection.send("error", errorPayload, correlationId);
    }
  }

  // ==========================================================================
  // Status Push Methods
  // ==========================================================================

  private async pushAuthStatus(): Promise<void> {
    try {
      const status = await this.authManager.getStatus();
      const payload: AuthStatusPayload = {
        authenticated: status.authenticated,
        method: status.method,
        provider: status.provider,
      };
      this.connection.send("auth:status", payload);
    } catch (error) {
      console.error("[ws] Failed to push auth status:", error);
    }
  }

  private pushProcessStatus(): void {
    const processes = this.processManager.getActiveProcesses();
    const payload: StatusProcessPayload = {
      count: processes.count,
      processIds: processes.processIds,
    };
    this.connection.send("status:process", payload);
  }

  private async pushHealthStatus(): Promise<void> {
    const processes = this.processManager.getActiveProcesses();
    const authStatus = await this.authManager.getStatus();
    const payload: StatusHealthPayload = {
      status: "ok",
      activeProcesses: processes.count,
      version: "1.0.0",
      uptimeMs: Date.now() - this.startTime,
      authenticated: authStatus.authenticated,
      authMethod: authStatus.method,
    };
    this.connection.send("status:health", payload);
  }
}
