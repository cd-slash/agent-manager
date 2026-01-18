import { ConvexHttpClient } from "convex/browser";
import type { api } from "@agent-manager/convex/api";
import type {
  SessionInfo,
  CliOutputMessage,
  ResultMessage,
  ContainerInfo,
} from "@agent-manager/agent-shared";

// Type for Convex API - will be properly typed when schema is added
type ConvexApi = typeof api;

export class ConvexSync {
  private client: ConvexHttpClient;
  private connected = false;

  constructor(convexUrl: string) {
    this.client = new ConvexHttpClient(convexUrl);
    this.connected = true;
    console.log(`[ConvexSync] Initialized with URL: ${convexUrl}`);
  }

  async createSession(params: {
    sessionId: string;
    containerId: string;
    prompt: string;
    taskId?: string;
    projectId?: string;
  }): Promise<void> {
    if (!this.connected) return;

    try {
      // @ts-expect-error - API will be typed when Convex schema is generated
      await this.client.mutation(api.agentSessions.create, {
        sessionId: params.sessionId,
        containerId: params.containerId,
        prompt: params.prompt,
        taskId: params.taskId,
        projectId: params.projectId,
        status: "starting",
        startedAt: Date.now(),
      });
    } catch (error) {
      console.error("[ConvexSync] Failed to create session:", error);
    }
  }

  async updateSessionStatus(
    sessionId: string,
    status: SessionInfo["status"],
    additionalData?: Partial<{
      completedAt: number;
      result: string;
      error: string;
      totalCostUsd: number;
      numTurns: number;
    }>
  ): Promise<void> {
    if (!this.connected) return;

    try {
      // @ts-expect-error - API will be typed when Convex schema is generated
      await this.client.mutation(api.agentSessions.updateStatus, {
        sessionId,
        status,
        ...additionalData,
      });
    } catch (error) {
      console.error("[ConvexSync] Failed to update session status:", error);
    }
  }

  async recordSessionOutput(
    sessionId: string,
    output: CliOutputMessage
  ): Promise<void> {
    if (!this.connected) return;

    try {
      // @ts-expect-error - API will be typed when Convex schema is generated
      await this.client.mutation(api.agentMessages.create, {
        sessionId,
        messageType: output.type,
        content: JSON.stringify(output),
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("[ConvexSync] Failed to record output:", error);
    }
  }

  async recordSessionResult(
    sessionId: string,
    result: ResultMessage
  ): Promise<void> {
    if (!this.connected) return;

    const status = result.subtype === "success" ? "completed" : "failed";

    await this.updateSessionStatus(sessionId, status, {
      completedAt: Date.now(),
      result: result.result,
      totalCostUsd: result.total_cost_usd,
      numTurns: result.num_turns,
      error: result.subtype !== "success" ? result.subtype : undefined,
    });
  }

  async updateContainerStatus(
    containerId: string,
    info: ContainerInfo,
    status: "online" | "offline"
  ): Promise<void> {
    if (!this.connected) return;

    try {
      // Update the containers table with connection status
      // @ts-expect-error - API will be typed when Convex schema is generated
      await this.client.mutation(api.containers.updateAgentStatus, {
        containerId,
        hostname: info.hostname,
        agentStatus: status,
        lastSeenAt: Date.now(),
      });
    } catch (error) {
      console.error("[ConvexSync] Failed to update container status:", error);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
