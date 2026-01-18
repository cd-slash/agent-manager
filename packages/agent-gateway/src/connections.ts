import type {
  ContainerInfo,
  HealthStatus,
  GatewayToContainerMessage,
} from "@agent-manager/agent-shared";
import type { ServerWebSocket } from "bun";

export interface ConnectedContainer {
  ws: ServerWebSocket<ContainerContext>;
  info: ContainerInfo;
  health: HealthStatus;
  connectedAt: number;
  lastPingAt: number;
  lastPongAt: number;
}

export interface ContainerContext {
  containerId: string | null;
  registered: boolean;
}

export class ConnectionManager {
  private containers: Map<string, ConnectedContainer> = new Map();
  private pendingSockets: Set<ServerWebSocket<ContainerContext>> = new Set();

  registerContainer(
    ws: ServerWebSocket<ContainerContext>,
    info: ContainerInfo
  ): void {
    // Remove from pending
    this.pendingSockets.delete(ws);

    // Update socket context
    ws.data.containerId = info.containerId;
    ws.data.registered = true;

    const container: ConnectedContainer = {
      ws,
      info,
      health: {
        status: "healthy",
        activeSessionCount: 0,
        uptime: 0,
      },
      connectedAt: Date.now(),
      lastPingAt: Date.now(),
      lastPongAt: Date.now(),
    };

    this.containers.set(info.containerId, container);
    console.log(`[ConnectionManager] Container registered: ${info.containerId} (${info.hostname})`);
  }

  unregisterContainer(containerId: string): void {
    this.containers.delete(containerId);
    console.log(`[ConnectionManager] Container unregistered: ${containerId}`);
  }

  addPendingSocket(ws: ServerWebSocket<ContainerContext>): void {
    this.pendingSockets.add(ws);
  }

  removePendingSocket(ws: ServerWebSocket<ContainerContext>): void {
    this.pendingSockets.delete(ws);
  }

  getContainer(containerId: string): ConnectedContainer | undefined {
    return this.containers.get(containerId);
  }

  getAllContainers(): ConnectedContainer[] {
    return Array.from(this.containers.values());
  }

  getOnlineContainers(): ConnectedContainer[] {
    return this.getAllContainers().filter((c) => c.health.status !== "unhealthy");
  }

  updateHealth(containerId: string, health: HealthStatus): void {
    const container = this.containers.get(containerId);
    if (container) {
      container.health = health;
      container.lastPongAt = Date.now();
    }
  }

  sendToContainer(containerId: string, message: GatewayToContainerMessage): boolean {
    const container = this.containers.get(containerId);
    if (!container) {
      console.warn(`[ConnectionManager] Container not found: ${containerId}`);
      return false;
    }

    try {
      container.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`[ConnectionManager] Failed to send to ${containerId}:`, error);
      return false;
    }
  }

  broadcast(message: GatewayToContainerMessage): void {
    const payload = JSON.stringify(message);
    for (const container of this.containers.values()) {
      try {
        container.ws.send(payload);
      } catch (error) {
        console.error(`[ConnectionManager] Broadcast failed for ${container.info.containerId}:`, error);
      }
    }
  }

  pingAll(): void {
    const now = Date.now();
    for (const container of this.containers.values()) {
      container.lastPingAt = now;
      this.sendToContainer(container.info.containerId, {
        type: "command",
        command: "ping",
      });
    }
  }

  // Check for stale connections (no pong in 60 seconds)
  pruneStaleConnections(maxAge = 60000): string[] {
    const now = Date.now();
    const pruned: string[] = [];

    for (const [containerId, container] of this.containers.entries()) {
      if (now - container.lastPongAt > maxAge) {
        console.warn(`[ConnectionManager] Pruning stale container: ${containerId}`);
        try {
          container.ws.close();
        } catch {
          // Ignore close errors
        }
        this.containers.delete(containerId);
        pruned.push(containerId);
      }
    }

    return pruned;
  }

  getStats(): {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    pending: number;
  } {
    const containers = this.getAllContainers();
    return {
      total: containers.length,
      healthy: containers.filter((c) => c.health.status === "healthy").length,
      degraded: containers.filter((c) => c.health.status === "degraded").length,
      unhealthy: containers.filter((c) => c.health.status === "unhealthy").length,
      pending: this.pendingSockets.size,
    };
  }
}
