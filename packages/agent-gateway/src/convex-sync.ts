/**
 * Convex Sync
 *
 * Syncs gateway events to Convex for persistence and frontend real-time updates.
 */

import { ConvexHttpClient } from "convex/browser";
import type {
  ExecStartPayload,
  ExecStreamPayload,
  ExecCompletePayload,
  CreateContainerResult,
} from "@agent-manager/agent-shared";

export class ConvexSync {
  private client: ConvexHttpClient;

  constructor(convexUrl: string) {
    this.client = new ConvexHttpClient(convexUrl);
    console.log(`[convex] Initialized with URL: ${convexUrl}`);
  }

  /**
   * Update container connection status
   */
  async updateContainerConnection(
    containerId: string,
    hostname: string,
    connected: boolean
  ): Promise<void> {
    try {
      // @ts-expect-error - API types will be generated
      await this.client.mutation("containers:updateAgentStatus", {
        containerId,
        hostname,
        agentStatus: connected ? "online" : "offline",
        lastSeenAt: Date.now(),
      });
    } catch (error) {
      console.error("[convex] Failed to update container connection:", error);
    }
  }

  /**
   * Record execution start
   */
  async recordExecStart(
    correlationId: string,
    containerId: string,
    options: ExecStartPayload,
    taskId?: string,
    projectId?: string
  ): Promise<void> {
    try {
      // @ts-expect-error - API types will be generated
      await this.client.mutation("agentSessions:create", {
        sessionId: correlationId,
        containerId,
        prompt: options.message,
        taskId,
        projectId,
        status: "starting",
        startedAt: Date.now(),
      });
    } catch (error) {
      console.error("[convex] Failed to record exec start:", error);
    }
  }

  /**
   * Record streaming event
   */
  async recordStreamEvent(
    correlationId: string,
    containerId: string,
    payload: ExecStreamPayload,
    taskId?: string,
    projectId?: string
  ): Promise<void> {
    try {
      // Update session status to running on first stream event
      // @ts-expect-error - API types will be generated
      await this.client.mutation("agentSessions:updateStatus", {
        sessionId: correlationId,
        status: "running",
      });

      // Record the message
      // @ts-expect-error - API types will be generated
      await this.client.mutation("agentMessages:create", {
        sessionId: correlationId,
        messageType: payload.streamType === "assistant" ? "assistant" :
                     payload.streamType === "result" ? "result" : "system",
        content: JSON.stringify(payload.data),
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("[convex] Failed to record stream event:", error);
    }
  }

  /**
   * Record execution completion
   */
  async recordExecComplete(
    correlationId: string,
    containerId: string,
    payload: ExecCompletePayload,
    taskId?: string,
    projectId?: string
  ): Promise<void> {
    try {
      const status = payload.result === "success" ? "completed" :
                     payload.result === "aborted" ? "cancelled" : "failed";

      // @ts-expect-error - API types will be generated
      await this.client.mutation("agentSessions:updateStatus", {
        sessionId: correlationId,
        status,
        completedAt: Date.now(),
        totalCostUsd: payload.totalCostUsd,
        numTurns: payload.numTurns,
        error: payload.error,
      });
    } catch (error) {
      console.error("[convex] Failed to record exec complete:", error);
    }
  }

  /**
   * Record new container created
   */
  async recordContainerCreated(
    result: CreateContainerResult,
    taskId?: string,
    projectId?: string
  ): Promise<void> {
    try {
      // Create container record
      // @ts-expect-error - API types will be generated
      await this.client.mutation("containers:createFromAgent", {
        containerId: result.containerId,
        name: result.name,
        hostname: result.hostname,
        repo: result.repo,
        branch: result.branch,
        server: result.server,
        network: result.network,
        lanIp: result.lanIp,
        wgPort: result.wgPort,
        taskId,
        projectId,
      });
    } catch (error) {
      console.error("[convex] Failed to record container created:", error);
    }
  }
}
