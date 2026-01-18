/**
 * Manager Connection
 *
 * WebSocket client that connects to the manager app server.
 * Handles reconnection, heartbeat, and message routing.
 */

import { EventEmitter } from "node:events";
import {
  type WebSocketMessage,
  type MessageType,
  type ConnectPayload,
  type ConnectedPayload,
  type HeartbeatPayload,
  type DisconnectPayload,
  type ExecStartPayload,
  type ExecAbortPayload,
  type AuthRequestPayload,
  type AuthFlowCompletePayload,
  type SessionDeletePayload,
  createMessage,
  parseMessage,
  serializeMessage,
} from "./protocol";

// Connection states
type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

// Configuration
interface ManagerConnectionConfig {
  /** Manager WebSocket URL (e.g., ws://manager.ts.net:8048/containers) */
  managerUrl: string;
  /** Container identifier */
  containerId: string;
  /** Tailscale hostname */
  hostname: string;
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;
  /** Reconnect base delay in ms (default: 1000) */
  reconnectBaseDelay?: number;
  /** Max reconnect delay in ms (default: 30000) */
  reconnectMaxDelay?: number;
  /** Max reconnect attempts (default: Infinity) */
  maxReconnectAttempts?: number;
}

// Message handler type
type MessageHandler<T = unknown> = (payload: T, message: WebSocketMessage<T>) => void | Promise<void>;

export class ManagerConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private config: Required<ManagerConnectionConfig>;
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatSeq = 0;
  private lastHeartbeatAck = 0;
  private messageHandlers: Map<MessageType, MessageHandler[]> = new Map();
  private pendingRequests: Map<string, { resolve: (msg: WebSocketMessage) => void; reject: (err: Error) => void; timeout: ReturnType<typeof setTimeout> }> = new Map();

  constructor(config: ManagerConnectionConfig) {
    super();
    this.config = {
      managerUrl: config.managerUrl,
      containerId: config.containerId,
      hostname: config.hostname,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      reconnectBaseDelay: config.reconnectBaseDelay ?? 1000,
      reconnectMaxDelay: config.reconnectMaxDelay ?? 30000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? Infinity,
    };
  }

  /**
   * Get the current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get the manager WebSocket URL
   */
  getManagerUrl(): string {
    return this.config.managerUrl;
  }

  /**
   * Connect to the manager app
   */
  async connect(): Promise<void> {
    if (this.state === "connected" || this.state === "connecting") {
      console.log("[ws] Already connected or connecting");
      return;
    }

    this.state = "connecting";
    this.emit("stateChange", this.state);

    return new Promise<void>((resolve, reject) => {
      try {
        console.log(`[ws] Connecting to ${this.config.managerUrl}`);
        this.ws = new WebSocket(this.config.managerUrl);

        const timeout = setTimeout(() => {
          if (this.state === "connecting") {
            this.ws?.close();
            reject(new Error("Connection timeout"));
          }
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          console.log("[ws] Connection opened, sending handshake");
          this.sendHandshake();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data.toString());
        };

        this.ws.onclose = (event) => {
          clearTimeout(timeout);
          console.log(`[ws] Connection closed: ${event.code} ${event.reason}`);
          this.handleDisconnect();
          if (this.state === "connecting") {
            reject(new Error(`Connection closed: ${event.reason || "Unknown reason"}`));
          }
        };

        this.ws.onerror = (event) => {
          console.error("[ws] Connection error:", event);
          // onclose will be called after onerror
        };

        // Wait for connected confirmation
        this.once("connected", () => {
          this.state = "connected";
          this.reconnectAttempts = 0;
          this.emit("stateChange", this.state);
          this.startHeartbeat();
          resolve();
        });

        this.once("connectionRejected", (reason: string) => {
          clearTimeout(timeout);
          reject(new Error(`Connection rejected: ${reason}`));
        });
      } catch (error) {
        this.state = "disconnected";
        this.emit("stateChange", this.state);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the manager app
   */
  async disconnect(reason = "Client disconnect"): Promise<void> {
    if (this.state === "disconnected") {
      return;
    }

    console.log(`[ws] Disconnecting: ${reason}`);
    this.stopHeartbeat();

    // Send disconnect message if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = createMessage<DisconnectPayload>("disconnect", {
        reason,
        graceful: true,
      });
      this.ws.send(serializeMessage(msg));
    }

    this.ws?.close(1000, reason);
    this.ws = null;
    this.state = "disconnected";
    this.emit("stateChange", this.state);
  }

  /**
   * Send a message to the manager
   */
  send<T>(type: MessageType, payload: T, correlationId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[ws] Cannot send ${type}: not connected`);
      return;
    }

    const msg = createMessage(type, payload, correlationId);
    this.ws.send(serializeMessage(msg));
  }

  /**
   * Send a request and wait for a response
   */
  async request<TReq, TRes>(
    type: MessageType,
    payload: TReq,
    timeoutMs = 30000
  ): Promise<WebSocketMessage<TRes>> {
    return new Promise((resolve, reject) => {
      const correlationId = crypto.randomUUID();

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Request timeout: ${type}`));
      }, timeoutMs);

      this.pendingRequests.set(correlationId, {
        resolve: resolve as (msg: WebSocketMessage) => void,
        reject,
        timeout,
      });

      this.send(type, payload, correlationId);
    });
  }

  /**
   * Register a handler for a message type
   */
  onMessage<T>(type: MessageType, handler: MessageHandler<T>): void {
    const handlers = this.messageHandlers.get(type) || [];
    handlers.push(handler as MessageHandler);
    this.messageHandlers.set(type, handlers);
  }

  /**
   * Remove a handler for a message type
   */
  offMessage<T>(type: MessageType, handler: MessageHandler<T>): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler as MessageHandler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Send initial handshake
   */
  private sendHandshake(): void {
    const payload: ConnectPayload = {
      containerId: this.config.containerId,
      hostname: this.config.hostname,
      version: "1.0.0",
      capabilities: ["claude", "auth", "sessions", "streaming"],
    };

    this.send("connect", payload);
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: string): void {
    try {
      const msg = parseMessage(data);

      // Handle connection response
      if (msg.type === "connected") {
        const payload = msg.payload as ConnectedPayload;
        if (payload.accepted) {
          console.log(`[ws] Connected to manager: ${payload.serverId}`);
          this.emit("connected");
        } else {
          console.log(`[ws] Connection rejected: ${payload.reason}`);
          this.emit("connectionRejected", payload.reason);
        }
        return;
      }

      // Handle heartbeat response
      if (msg.type === "heartbeat") {
        this.lastHeartbeatAck = Date.now();
        return;
      }

      // Handle correlated responses
      if (msg.correlationId && this.pendingRequests.has(msg.correlationId)) {
        const pending = this.pendingRequests.get(msg.correlationId)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(msg.correlationId);

        if (msg.type === "error") {
          pending.reject(new Error((msg.payload as { message: string }).message));
        } else {
          pending.resolve(msg);
        }
        return;
      }

      // Route to registered handlers
      const handlers = this.messageHandlers.get(msg.type);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(msg.payload, msg);
          } catch (error) {
            console.error(`[ws] Handler error for ${msg.type}:`, error);
          }
        }
      }

      // Emit event for message type
      this.emit(`message:${msg.type}`, msg.payload, msg);
    } catch (error) {
      console.error("[ws] Error parsing message:", error);
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    this.stopHeartbeat();
    this.ws = null;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Connection closed"));
    }
    this.pendingRequests.clear();

    // Attempt reconnection
    if (this.state !== "disconnected" && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.state = "disconnected";
      this.emit("stateChange", this.state);
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    this.state = "reconnecting";
    this.emit("stateChange", this.state);

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectMaxDelay
    );

    console.log(`[ws] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await this.connect();
      } catch (error) {
        console.error("[ws] Reconnection failed:", error);
        // handleDisconnect will schedule another attempt
      }
    }, delay);
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastHeartbeatAck = Date.now();

    this.heartbeatTimer = setInterval(() => {
      // Check if we missed a heartbeat response
      const timeSinceAck = Date.now() - this.lastHeartbeatAck;
      if (timeSinceAck > this.config.heartbeatInterval * 2) {
        console.warn("[ws] Heartbeat timeout, reconnecting");
        this.ws?.close(4000, "Heartbeat timeout");
        return;
      }

      // Send heartbeat
      const payload: HeartbeatPayload = {
        seq: ++this.heartbeatSeq,
        sentAt: Date.now(),
      };
      this.send("heartbeat", payload);
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// =============================================================================
// Message Handler Types for Specific Messages
// =============================================================================

export type ExecStartHandler = MessageHandler<ExecStartPayload>;
export type ExecAbortHandler = MessageHandler<ExecAbortPayload>;
export type AuthRequestHandler = MessageHandler<AuthRequestPayload>;
export type AuthFlowCompleteHandler = MessageHandler<AuthFlowCompletePayload>;
export type SessionDeleteHandler = MessageHandler<SessionDeletePayload>;
