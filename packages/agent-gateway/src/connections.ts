/**
 * Connection Manager
 *
 * Manages WebSocket connections from container API instances.
 * Each container runs the container/api service and connects to this gateway.
 */

import type { ServerWebSocket } from "bun";
import type {
  ConnectPayload,
  StatusHealthPayload,
  WebSocketMessage,
  MessageType,
} from "@agent-manager/agent-shared";
import { createMessage, serializeMessage } from "@agent-manager/agent-shared";

export interface ConnectedContainer {
  ws: ServerWebSocket<ContainerContext>;
  info: ConnectPayload;
  health: StatusHealthPayload | null;
  connectedAt: number;
  lastHeartbeat: number;
}

export interface ContainerContext {
  containerId: string | null;
  registered: boolean;
}

export class ConnectionManager {
  private containers: Map<string, ConnectedContainer> = new Map();
  private pendingSockets: Set<ServerWebSocket<ContainerContext>> = new Set();
  private serverId: string;

  constructor(serverId: string) {
    this.serverId = serverId;
  }

  /**
   * Register a new container connection
   */
  registerContainer(
    ws: ServerWebSocket<ContainerContext>,
    info: ConnectPayload
  ): void {
    // Remove from pending
    this.pendingSockets.delete(ws);

    // Update socket context
    ws.data.containerId = info.containerId;
    ws.data.registered = true;

    const container: ConnectedContainer = {
      ws,
      info,
      health: null,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    this.containers.set(info.containerId, container);
    console.log(
      `[connections] Container registered: ${info.containerId} (${info.hostname})`
    );
    console.log(`[connections] Capabilities: ${info.capabilities.join(", ")}`);

    // Send connected confirmation
    this.send(ws, "connected", {
      accepted: true,
      serverId: this.serverId,
    });
  }

  /**
   * Unregister a container
   */
  unregisterContainer(containerId: string): void {
    this.containers.delete(containerId);
    console.log(`[connections] Container unregistered: ${containerId}`);
  }

  /**
   * Add a socket to pending (not yet registered)
   */
  addPendingSocket(ws: ServerWebSocket<ContainerContext>): void {
    this.pendingSockets.add(ws);
  }

  /**
   * Remove a socket from pending
   */
  removePendingSocket(ws: ServerWebSocket<ContainerContext>): void {
    this.pendingSockets.delete(ws);
  }

  /**
   * Get a connected container by ID
   */
  getContainer(containerId: string): ConnectedContainer | undefined {
    return this.containers.get(containerId);
  }

  /**
   * Get all connected containers
   */
  getAllContainers(): ConnectedContainer[] {
    return Array.from(this.containers.values());
  }

  /**
   * Get containers that are healthy
   */
  getHealthyContainers(): ConnectedContainer[] {
    return this.getAllContainers().filter(
      (c) => c.health?.status === "ok" || c.health?.status === "degraded"
    );
  }

  /**
   * Update container health status
   */
  updateHealth(containerId: string, health: StatusHealthPayload): void {
    const container = this.containers.get(containerId);
    if (container) {
      container.health = health;
      container.lastHeartbeat = Date.now();
    }
  }

  /**
   * Update last heartbeat time
   */
  updateHeartbeat(containerId: string): void {
    const container = this.containers.get(containerId);
    if (container) {
      container.lastHeartbeat = Date.now();
    }
  }

  /**
   * Send a message to a specific container
   */
  send<T>(
    target: string | ServerWebSocket<ContainerContext>,
    type: MessageType,
    payload: T,
    correlationId?: string
  ): boolean {
    const ws =
      typeof target === "string" ? this.containers.get(target)?.ws : target;

    if (!ws) {
      console.warn(`[connections] Cannot send ${type}: target not found`);
      return false;
    }

    try {
      const msg = createMessage(type, payload, correlationId);
      ws.send(serializeMessage(msg));
      return true;
    } catch (error) {
      console.error(`[connections] Failed to send ${type}:`, error);
      return false;
    }
  }

  /**
   * Send to a container by ID
   */
  sendToContainer<T>(
    containerId: string,
    type: MessageType,
    payload: T,
    correlationId?: string
  ): boolean {
    return this.send(containerId, type, payload, correlationId);
  }

  /**
   * Broadcast to all containers
   */
  broadcast<T>(type: MessageType, payload: T): void {
    const msg = createMessage(type, payload);
    const data = serializeMessage(msg);

    for (const container of this.containers.values()) {
      try {
        container.ws.send(data);
      } catch (error) {
        console.error(
          `[connections] Broadcast failed for ${container.info.containerId}:`,
          error
        );
      }
    }
  }

  /**
   * Send heartbeat to all containers
   */
  pingAll(): void {
    const now = Date.now();
    for (const container of this.containers.values()) {
      this.send(container.ws, "heartbeat", {
        seq: 0, // Manager doesn't track seq
        sentAt: now,
      });
    }
  }

  /**
   * Check for stale connections (no heartbeat in given time)
   */
  pruneStaleConnections(maxAge = 90000): string[] {
    const now = Date.now();
    const pruned: string[] = [];

    for (const [containerId, container] of this.containers.entries()) {
      if (now - container.lastHeartbeat > maxAge) {
        console.warn(`[connections] Pruning stale container: ${containerId}`);
        try {
          container.ws.close(4000, "Heartbeat timeout");
        } catch {
          // Ignore close errors
        }
        this.containers.delete(containerId);
        pruned.push(containerId);
      }
    }

    return pruned;
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    pending: number;
    authenticated: number;
  } {
    const containers = this.getAllContainers();
    return {
      total: containers.length,
      healthy: containers.filter((c) => c.health?.status === "ok").length,
      degraded: containers.filter((c) => c.health?.status === "degraded").length,
      unhealthy: containers.filter(
        (c) => !c.health || c.health.status === "error"
      ).length,
      pending: this.pendingSockets.size,
      authenticated: containers.filter((c) => c.health?.authenticated).length,
    };
  }

  /**
   * Find a container that can execute a task
   */
  findAvailableContainer(): ConnectedContainer | null {
    const healthy = this.getHealthyContainers();

    if (healthy.length === 0) {
      return null;
    }

    // Sort by active processes (fewest first)
    healthy.sort((a, b) => {
      const aProcs = a.health?.activeProcesses ?? 0;
      const bProcs = b.health?.activeProcesses ?? 0;
      return aProcs - bProcs;
    });

    return healthy[0] ?? null;
  }
}
