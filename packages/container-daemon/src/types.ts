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
	message: string
	/** Session ID to resume a previous conversation */
	sessionId?: string
	/** Override the system prompt */
	systemPrompt?: string
}

// =============================================================================
// Session Types
// =============================================================================

export interface Session {
	id: string
	project: string
	createdAt: Date
	lastAccessedAt: Date
}

export interface SessionMessage {
	role: string
	content: unknown
	timestamp: string
	uuid: string
}

// =============================================================================
// Process Types
// =============================================================================

export interface ProcessInfo {
	processId: number
	sessionId?: string
	startedAt: number
	status: "running" | "completed" | "aborted" | "error"
}

export interface ActiveProcesses {
	count: number
	processIds: number[]
}

// =============================================================================
// Stream Types
// =============================================================================

export interface OpenCodeStreamData {
	type: string
	properties?: Record<string, unknown>
}

// =============================================================================
// Health Types
// =============================================================================

export interface HealthStatus {
	status: "ok" | "degraded" | "error"
	activeProcesses: number
	version?: string
	uptime?: number
	convexConnected: boolean
}

// =============================================================================
// Event Types (for internal EventEmitter pattern)
// =============================================================================

export type ContainerEventType =
	| "process:started"
	| "process:output"
	| "process:completed"
	| "process:error"
	| "session:created"
	| "session:updated"
	| "health:changed"

export interface ContainerEvent<T = unknown> {
	type: ContainerEventType
	timestamp: number
	data: T
}

export interface ProcessStartedEvent {
	processId: number
	sessionId?: string
}

export interface ProcessOutputEvent {
	processId: number
	data: OpenCodeStreamData
}

export interface ProcessCompletedEvent {
	processId: number
	result: MessageResult
}

export interface ProcessErrorEvent {
	processId: number
	error: string
	exitCode?: number
}
