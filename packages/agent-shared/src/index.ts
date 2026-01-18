// Shared types for agent-runner and agent-gateway communication

// ============================================================================
// Container Registration & Health
// ============================================================================

export interface ContainerInfo {
  containerId: string;
  hostname: string;
  workingDirectory: string;
  capabilities?: string[];
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  activeSessionCount: number;
  uptime: number;
  lastError?: string;
}

// ============================================================================
// Session Management
// ============================================================================

export type SessionStatus = "starting" | "running" | "completed" | "failed" | "cancelled";

export interface SessionConfig {
  workingDirectory?: string;
  allowedTools?: string[];
  maxTurns?: number;
  timeout?: number; // milliseconds
  model?: string;
  systemPrompt?: string;
}

// ============================================================================
// Claude Code CLI Print Mode Message Types
// Based on Claude Code's --print mode JSON output format
// ============================================================================

export interface AssistantMessage {
  type: "assistant";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    content: ContentBlock[];
    model: string;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  session_id: string;
}

export interface ResultMessage {
  type: "result";
  subtype: "success" | "error" | "error_max_turns" | "interrupted";
  total_cost_usd: number;
  total_duration_ms: number;
  total_duration_api_ms: number;
  num_turns: number;
  session_id: string;
  result?: string;
}

export interface SystemMessage {
  type: "system";
  subtype: "init" | "progress";
  message?: string;
  session_id: string;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// Union of all CLI output messages
export type CliOutputMessage = AssistantMessage | ResultMessage | SystemMessage;

// ============================================================================
// WebSocket Protocol Messages (Container <-> Gateway)
// ============================================================================

// --- Messages from Gateway to Container ---

export interface StartSessionCommand {
  type: "command";
  command: "start_session";
  sessionId: string;
  prompt: string;
  config?: SessionConfig;
}

export interface CancelSessionCommand {
  type: "command";
  command: "cancel_session";
  sessionId: string;
}

export interface SendInputCommand {
  type: "command";
  command: "send_input";
  sessionId: string;
  input: string;
}

export interface PingCommand {
  type: "command";
  command: "ping";
}

export type GatewayToContainerMessage =
  | StartSessionCommand
  | CancelSessionCommand
  | SendInputCommand
  | PingCommand;

// --- Messages from Container to Gateway ---

export interface RegisterMessage {
  type: "register";
  container: ContainerInfo;
}

export interface SessionStartedEvent {
  type: "event";
  event: "session_started";
  sessionId: string;
  timestamp: number;
}

export interface SessionOutputEvent {
  type: "event";
  event: "session_output";
  sessionId: string;
  output: CliOutputMessage;
  timestamp: number;
}

export interface SessionCompletedEvent {
  type: "event";
  event: "session_completed";
  sessionId: string;
  result: ResultMessage;
  timestamp: number;
}

export interface SessionErrorEvent {
  type: "event";
  event: "session_error";
  sessionId: string;
  error: string;
  timestamp: number;
}

export interface PongMessage {
  type: "pong";
  health: HealthStatus;
}

export type ContainerToGatewayMessage =
  | RegisterMessage
  | SessionStartedEvent
  | SessionOutputEvent
  | SessionCompletedEvent
  | SessionErrorEvent
  | PongMessage;

// ============================================================================
// Frontend API Messages (Frontend <-> Gateway via Convex)
// ============================================================================

export interface CreateSessionRequest {
  containerId: string;
  prompt: string;
  taskId?: string;
  projectId?: string;
  config?: SessionConfig;
}

export interface SessionInfo {
  sessionId: string;
  containerId: string;
  status: SessionStatus;
  taskId?: string;
  projectId?: string;
  startedAt: number;
  completedAt?: number;
  result?: string;
  error?: string;
  totalCostUsd?: number;
  numTurns?: number;
}

// ============================================================================
// Utility Types
// ============================================================================

export function isAssistantMessage(msg: CliOutputMessage): msg is AssistantMessage {
  return msg.type === "assistant";
}

export function isResultMessage(msg: CliOutputMessage): msg is ResultMessage {
  return msg.type === "result";
}

export function isSystemMessage(msg: CliOutputMessage): msg is SystemMessage {
  return msg.type === "system";
}
