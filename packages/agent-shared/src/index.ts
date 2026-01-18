/**
 * Agent Shared Types
 *
 * Protocol types for communication between container API and agent-gateway.
 * This mirrors the protocol in container/api/src/protocol.ts
 */

// =============================================================================
// Base Message Types
// =============================================================================

export interface WebSocketMessage<T = unknown> {
  /** Unique message ID (UUID) */
  id: string;
  /** Message category */
  type: MessageType;
  /** Type-specific payload */
  payload: T;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** For request/response pairing */
  correlationId?: string;
}

export type MessageType =
  // Connection lifecycle
  | "connect"
  | "connected"
  | "heartbeat"
  | "disconnect"

  // Authentication
  | "auth:request"
  | "auth:status"
  | "auth:flow:start"
  | "auth:flow:url"
  | "auth:flow:complete"

  // Execution
  | "exec:start"
  | "exec:stream"
  | "exec:complete"
  | "exec:abort"
  | "exec:aborted"

  // Session management
  | "session:list"
  | "session:data"
  | "session:delete"

  // Status updates (push-based)
  | "status:process"
  | "status:health"
  | "status:resource"

  // Errors
  | "error";

// =============================================================================
// Connection Messages
// =============================================================================

export interface ConnectPayload {
  /** Container identifier (e.g., "tar-bat-sag") */
  containerId: string;
  /** Tailscale hostname (e.g., "tar-bat-sag.ts.net") */
  hostname: string;
  /** Container API version */
  version: string;
  /** Supported capabilities */
  capabilities: string[];
}

export interface ConnectedPayload {
  /** Whether the connection was accepted */
  accepted: boolean;
  /** Manager server identifier */
  serverId: string;
  /** Optional rejection reason */
  reason?: string;
}

export interface HeartbeatPayload {
  /** Sequence number for ordering */
  seq: number;
  /** Unix timestamp of when heartbeat was sent */
  sentAt: number;
}

export interface DisconnectPayload {
  /** Reason for disconnect */
  reason: string;
  /** Whether this is a graceful shutdown */
  graceful: boolean;
}

// =============================================================================
// Authentication Messages
// =============================================================================

export interface AuthRequestPayload {
  /** OAuth token string */
  token: string;
}

export interface AuthStatusPayload {
  /** Whether the container is authenticated */
  authenticated: boolean;
  /** Authentication method (e.g., "oauth") */
  method?: string;
  /** Provider name (e.g., "anthropic") */
  provider?: string;
}

export interface AuthFlowStartPayload {
  /** No payload needed to start flow */
}

export interface AuthFlowUrlPayload {
  /** Flow identifier */
  flowId: string;
  /** OAuth URL for user to visit */
  url: string;
  /** Seconds until flow expires */
  expiresIn: number;
}

export interface AuthFlowCompletePayload {
  /** Flow identifier */
  flowId: string;
  /** Authorization code from OAuth provider */
  code: string;
}

// =============================================================================
// Execution Messages
// =============================================================================

export interface ExecStartPayload {
  /** Session ID to resume (optional) */
  sessionId?: string;
  /** The message/prompt to send */
  message: string;
  /** Model to use: haiku, sonnet, or opus */
  model?: string;
  /** Working directory for Claude CLI */
  workingDirectory?: string;
  /** Permission mode: default, acceptEdits, bypassPermissions, plan */
  permissionMode?: string;
  /** Override the system prompt */
  systemPrompt?: string;
  /** Append to the system prompt */
  appendSystemPrompt?: string;
  /** List of allowed tools */
  allowedTools?: string[];
  /** List of disallowed tools */
  disallowedTools?: string[];
  /** Maximum budget in USD */
  maxBudget?: number;
  /** Additional directories to allow tool access */
  addDir?: string[];
  /** Task ID for tracking (manager-side only) */
  taskId?: string;
  /** Project ID for tracking (manager-side only) */
  projectId?: string;
}

export interface ExecStreamPayload {
  /** Process ID for this execution */
  processId: number;
  /** Type of stream event from Claude CLI */
  streamType:
    | "system"
    | "assistant"
    | "user"
    | "tool_use"
    | "tool_result"
    | "result"
    | "error";
  /** The actual stream data from Claude CLI */
  data: ClaudeStreamData;
}

export interface ClaudeStreamData {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: {
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
      tool_use_id?: string;
      name?: string;
      input?: unknown;
    }>;
  };
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  usage?: unknown;
  modelUsage?: Record<
    string,
    {
      costUSD: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens?: number;
      cacheWriteInputTokens?: number;
    }
  >;
}

export interface ExecCompletePayload {
  /** Process ID */
  processId: number;
  /** Session ID */
  sessionId?: string;
  /** Result status */
  result: "success" | "error" | "aborted";
  /** Total cost in USD */
  totalCostUsd?: number;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Number of conversation turns */
  numTurns?: number;
  /** Per-model usage breakdown */
  modelUsage?: Record<
    string,
    {
      costUSD: number;
      inputTokens: number;
      outputTokens: number;
    }
  >;
  /** Error message if result is "error" */
  error?: string;
  /** Exit code if result is "error" */
  exitCode?: number;
}

export interface ExecAbortPayload {
  /** Process ID to abort */
  processId: number;
}

export interface ExecAbortedPayload {
  /** Process ID that was aborted */
  processId: number;
  /** Whether abort was successful */
  success: boolean;
}

// =============================================================================
// Session Messages
// =============================================================================

export interface SessionListPayload {
  /** No payload needed to list sessions */
}

export interface SessionDataPayload {
  /** Sessions list (for list response) */
  sessions?: Array<{
    id: string;
    project: string;
    createdAt: string;
    lastAccessedAt: string;
  }>;
  /** Messages for a specific session */
  messages?: Array<{
    role: string;
    content: unknown;
    timestamp: string;
    uuid: string;
  }>;
  /** Deleted session ID (for delete confirmation) */
  deleted?: string;
}

export interface SessionDeletePayload {
  /** Session ID to delete */
  sessionId: string;
}

// =============================================================================
// Status Messages
// =============================================================================

export interface StatusProcessPayload {
  /** Active process count */
  count: number;
  /** Active process IDs */
  processIds: number[];
  /** Process details */
  processes?: Array<{
    processId: number;
    sessionId?: string;
    startedAt: number;
    status: "running" | "completed" | "aborted" | "error";
  }>;
}

export interface StatusHealthPayload {
  /** Overall health status */
  status: "ok" | "degraded" | "error";
  /** Active process count */
  activeProcesses: number;
  /** API version */
  version: string;
  /** Uptime in milliseconds */
  uptimeMs: number;
  /** Authentication status */
  authenticated: boolean;
  /** Auth method if authenticated */
  authMethod?: string;
}

export interface StatusResourcePayload {
  /** CPU usage percentage (0-100) */
  cpuPercent?: number;
  /** Memory usage in bytes */
  memoryBytes?: number;
  /** Memory limit in bytes */
  memoryLimitBytes?: number;
  /** Disk usage in bytes */
  diskBytes?: number;
}

// =============================================================================
// Error Messages
// =============================================================================

export interface ErrorPayload {
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a new WebSocket message with auto-generated ID and timestamp
 */
export function createMessage<T>(
  type: MessageType,
  payload: T,
  correlationId?: string
): WebSocketMessage<T> {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
    correlationId,
  };
}

/**
 * Parse a WebSocket message from a string
 */
export function parseMessage(data: string): WebSocketMessage {
  return JSON.parse(data) as WebSocketMessage;
}

/**
 * Serialize a WebSocket message to a string
 */
export function serializeMessage(message: WebSocketMessage): string {
  return JSON.stringify(message);
}

// =============================================================================
// Type Guards
// =============================================================================

export function isConnectMessage(
  msg: WebSocketMessage
): msg is WebSocketMessage<ConnectPayload> {
  return msg.type === "connect";
}

export function isConnectedMessage(
  msg: WebSocketMessage
): msg is WebSocketMessage<ConnectedPayload> {
  return msg.type === "connected";
}

export function isHeartbeatMessage(
  msg: WebSocketMessage
): msg is WebSocketMessage<HeartbeatPayload> {
  return msg.type === "heartbeat";
}

export function isExecStartMessage(
  msg: WebSocketMessage
): msg is WebSocketMessage<ExecStartPayload> {
  return msg.type === "exec:start";
}

export function isExecStreamMessage(
  msg: WebSocketMessage
): msg is WebSocketMessage<ExecStreamPayload> {
  return msg.type === "exec:stream";
}

export function isExecCompleteMessage(
  msg: WebSocketMessage
): msg is WebSocketMessage<ExecCompletePayload> {
  return msg.type === "exec:complete";
}

export function isAuthRequestMessage(
  msg: WebSocketMessage
): msg is WebSocketMessage<AuthRequestPayload> {
  return msg.type === "auth:request";
}

export function isAuthStatusMessage(
  msg: WebSocketMessage
): msg is WebSocketMessage<AuthStatusPayload> {
  return msg.type === "auth:status";
}

export function isErrorMessage(
  msg: WebSocketMessage
): msg is WebSocketMessage<ErrorPayload> {
  return msg.type === "error";
}

// =============================================================================
// Container Creation Types
// =============================================================================

export interface CreateContainerRequest {
  /** GitHub repository (owner/repo) */
  repo: string;
  /** Git branch to work on */
  branch?: string;
  /** Custom container name (default: auto-generated) */
  name?: string;
  /** Target server (default: localhost) */
  server?: string;
  /** Task ID to associate with */
  taskId?: string;
  /** Project ID to associate with */
  projectId?: string;
}

export interface CreateContainerResult {
  /** Container name */
  name: string;
  /** Docker container ID/project name */
  containerId: string;
  /** Tailscale hostname */
  hostname: string;
  /** GitHub repo */
  repo: string;
  /** Git branch */
  branch: string;
  /** Server hostname */
  server: string;
  /** Network type */
  network: "macvlan" | "bridge";
  /** LAN IP if macvlan */
  lanIp?: string;
  /** WireGuard port if bridge */
  wgPort?: number;
}

export interface ContainerInfo {
  /** Container name/ID */
  containerId: string;
  /** Tailscale hostname */
  hostname: string;
  /** Connection status */
  connected: boolean;
  /** Health status */
  health: StatusHealthPayload | null;
  /** Connected at timestamp */
  connectedAt?: number;
  /** Last heartbeat timestamp */
  lastHeartbeat?: number;
}
