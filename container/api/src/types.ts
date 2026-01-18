/**
 * Container API Types
 *
 * Shared type definitions for the container API.
 */

// =============================================================================
// Message Options
// =============================================================================

export interface MessageOptions {
  /** The message/prompt to send */
  message: string;
  /** Model to use: haiku, sonnet, or opus */
  model?: string;
  /** Session ID to resume a previous conversation */
  sessionId?: string;
  /** Continue the most recent session */
  continue?: boolean;
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
  /** Permission mode: default, acceptEdits, bypassPermissions, plan */
  permissionMode?: string;
  /** Working directory for Claude CLI */
  workingDirectory?: string;
  /** Additional directories to allow tool access */
  addDir?: string[];
  /** Whether to stream the response */
  stream?: boolean;
}

// =============================================================================
// Auth Types
// =============================================================================

export interface AuthStatus {
  provider: string;
  authenticated: boolean;
  method?: string;
}

export interface OAuthFlowState {
  flowId: string;
  url: string;
  expiresAt: number;
  port: number;
  server: unknown;
  process?: unknown; // ChildProcess handle for the auth login command
  terminal?: unknown; // Bun.Terminal handle for PTY interaction
  codeVerifier?: string; // PKCE code verifier for OAuth flow
}

export interface OAuthStartResult {
  flowId: string;
  url: string;
  expiresIn: number;
}

export interface OAuthCompleteResult {
  success: boolean;
  token: string;
}

// =============================================================================
// Session Types
// =============================================================================

export interface Session {
  id: string;
  project: string;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface SessionMessage {
  role: string;
  content: unknown;
  timestamp: string;
  uuid: string;
}

// =============================================================================
// Process Types
// =============================================================================

export interface ProcessInfo {
  processId: number;
  sessionId?: string;
  startedAt: number;
  status: "running" | "completed" | "aborted" | "error";
}

export interface ActiveProcesses {
  count: number;
  processIds: number[];
}

// =============================================================================
// Stream Types
// =============================================================================

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
  modelUsage?: Record<string, ModelUsage>;
}

export interface ModelUsage {
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}

export interface MessageResult {
  success: boolean;
  processId: number;
  result?: string;
  session_id?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  usage?: unknown;
  modelUsage?: Record<string, ModelUsage>;
  error?: string;
  exitCode?: number;
}

// =============================================================================
// Health Types
// =============================================================================

export interface HealthStatus {
  status: string;
  activeProcesses: number;
  version?: string;
  uptime?: number;
}

// =============================================================================
// Model Types
// =============================================================================

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

// =============================================================================
// Event Types (for internal EventEmitter pattern)
// =============================================================================

export type ContainerEventType =
  | "auth:changed"
  | "process:started"
  | "process:output"
  | "process:completed"
  | "process:error"
  | "session:created"
  | "session:updated"
  | "health:changed";

export interface ContainerEvent<T = unknown> {
  type: ContainerEventType;
  timestamp: number;
  data: T;
}

export interface AuthChangedEvent {
  authenticated: boolean;
  method?: string;
}

export interface ProcessStartedEvent {
  processId: number;
  sessionId?: string;
}

export interface ProcessOutputEvent {
  processId: number;
  data: ClaudeStreamData;
}

export interface ProcessCompletedEvent {
  processId: number;
  result: MessageResult;
}

export interface ProcessErrorEvent {
  processId: number;
  error: string;
  exitCode?: number;
}
