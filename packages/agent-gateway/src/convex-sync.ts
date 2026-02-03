/**
 * Convex Sync
 *
 * Syncs gateway events to Convex for persistence and frontend real-time updates.
 *
 * ## Structured Streaming
 *
 * Streaming events are parsed into structured fields:
 * - text: Plain text content
 * - tool_use: Tool invocation with name and input
 * - tool_result: Tool execution result
 * - error: Error messages
 * - system: System messages
 * - result: Final execution result
 *
 * Messages are stored with sequence numbers for proper ordering.
 */

import type {
	CreateContainerRequest,
	CreateContainerResult,
	ExecCompletePayload,
	ExecStartPayload,
	ExecStreamPayload,
} from "@agent-manager/agent-shared"
import { ConvexHttpClient } from "convex/browser"

// Track sequence numbers per session for message ordering
const sessionSequences = new Map<string, number>()

export class ConvexSync {
	private client: ConvexHttpClient

	// Batch buffer for high-throughput streaming
	private batchBuffer: Map<
		string,
		{
			messages: Array<{
				sessionId: string
				streamType?: string
				content: unknown
				sequenceNumber?: number
			}>
			timeout: ReturnType<typeof setTimeout> | null
		}
	> = new Map()
	private readonly BATCH_SIZE = 10
	private readonly BATCH_TIMEOUT_MS = 100

	constructor(convexUrl: string) {
		this.client = new ConvexHttpClient(convexUrl)
		console.log(`[convex] Initialized with URL: ${convexUrl}`)
	}

	/**
	 * Update container connection status
	 */
	async updateContainerConnection(
		containerId: string,
		hostname: string,
		connected: boolean,
	): Promise<void> {
		try {
			// @ts-expect-error - API types will be generated
			await this.client.mutation("containers:updateAgentStatus", {
				containerId,
				hostname,
				agentStatus: connected ? "online" : "offline",
				lastSeenAt: Date.now(),
			})

			// Also update container pool status
			if (connected) {
				// @ts-expect-error - API types will be generated
				await this.client.mutation("containerPool:register", {
					containerId,
					hostname,
				})
			} else {
				// @ts-expect-error - API types will be generated
				await this.client.mutation("containerPool:unregister", {
					containerId,
				})
			}
		} catch (error) {
			console.error("[convex] Failed to update container connection:", error)
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
		projectId?: string,
	): Promise<void> {
		try {
			// Reset sequence for this session
			sessionSequences.set(correlationId, 0)

			// @ts-expect-error - API types will be generated
			await this.client.mutation("agentSessions:create", {
				sessionId: correlationId,
				containerId,
				prompt: options.message,
				taskId,
				projectId,
				status: "starting",
				startedAt: Date.now(),
			})

			// Update container pool to busy
			// @ts-expect-error - API types will be generated
			await this.client.mutation("containerPool:acquire", {
				containerId,
				sessionId: correlationId,
			})
		} catch (error) {
			console.error("[convex] Failed to record exec start:", error)
		}
	}

	/**
	 * Record streaming event with structured content
	 */
	async recordStreamEvent(
		correlationId: string,
		_containerId: string,
		payload: ExecStreamPayload,
		_taskId?: string,
		_projectId?: string,
	): Promise<void> {
		try {
			// Update session status to running on first stream event
			// @ts-expect-error - API types will be generated
			await this.client.mutation("agentSessions:updateStatus", {
				sessionId: correlationId,
				status: "running",
			})

			// Get next sequence number
			const seq = sessionSequences.get(correlationId) ?? 0
			sessionSequences.set(correlationId, seq + 1)

			// Record the message with structured content
			// The agentMessages.create mutation will parse the content
			// @ts-expect-error - API types will be generated
			await this.client.mutation("agentMessages:create", {
				sessionId: correlationId,
				streamType: payload.streamType,
				content: payload.data, // Pass raw data, not stringified
				sequenceNumber: seq,
			})
		} catch (error) {
			console.error("[convex] Failed to record stream event:", error)
		}
	}

	/**
	 * Record streaming event with batching for high-throughput
	 * Collects messages and sends them in batches for efficiency
	 */
	async recordStreamEventBatched(
		correlationId: string,
		_containerId: string,
		payload: ExecStreamPayload,
		_taskId?: string,
		_projectId?: string,
	): Promise<void> {
		// Get or create batch buffer for this session
		let buffer = this.batchBuffer.get(correlationId)
		if (!buffer) {
			buffer = { messages: [], timeout: null }
			this.batchBuffer.set(correlationId, buffer)
		}

		// Get next sequence number
		const seq = sessionSequences.get(correlationId) ?? 0
		sessionSequences.set(correlationId, seq + 1)

		// Add message to buffer
		buffer.messages.push({
			sessionId: correlationId,
			streamType: payload.streamType,
			content: payload.data,
			sequenceNumber: seq,
		})

		// If buffer is full, flush immediately
		if (buffer.messages.length >= this.BATCH_SIZE) {
			await this.flushBatch(correlationId)
			return
		}

		// Set up timeout to flush if not full
		if (!buffer.timeout) {
			buffer.timeout = setTimeout(async () => {
				await this.flushBatch(correlationId)
			}, this.BATCH_TIMEOUT_MS)
		}
	}

	/**
	 * Flush batched messages for a session
	 */
	private async flushBatch(correlationId: string): Promise<void> {
		const buffer = this.batchBuffer.get(correlationId)
		if (!buffer || buffer.messages.length === 0) return

		// Clear timeout
		if (buffer.timeout) {
			clearTimeout(buffer.timeout)
			buffer.timeout = null
		}

		// Get messages and clear buffer
		const messages = [...buffer.messages]
		buffer.messages = []

		try {
			// Update session status to running
			// @ts-expect-error - API types will be generated
			await this.client.mutation("agentSessions:updateStatus", {
				sessionId: correlationId,
				status: "running",
			})

			// Send batch
			// @ts-expect-error - API types will be generated
			await this.client.mutation("agentMessages:createBatch", {
				messages,
			})
		} catch (error) {
			console.error("[convex] Failed to flush message batch:", error)
		}
	}

	/**
	 * Record execution completion
	 */
	async recordExecComplete(
		correlationId: string,
		containerId: string,
		payload: ExecCompletePayload,
		_taskId?: string,
		_projectId?: string,
	): Promise<void> {
		try {
			// Flush any remaining batched messages
			await this.flushBatch(correlationId)

			const status =
				payload.result === "success"
					? "completed"
					: payload.result === "aborted"
						? "cancelled"
						: "failed"

			// Record final result as a message
			const seq = sessionSequences.get(correlationId) ?? 0
			// @ts-expect-error - API types will be generated
			await this.client.mutation("agentMessages:createStructured", {
				sessionId: correlationId,
				messageType: "result",
				text:
					typeof payload.resultText === "string"
						? payload.resultText
						: JSON.stringify(payload),
				sequenceNumber: seq,
			})

			// @ts-expect-error - API types will be generated
			await this.client.mutation("agentSessions:updateStatus", {
				sessionId: correlationId,
				status,
				completedAt: Date.now(),
				totalCostUsd: payload.totalCostUsd,
				numTurns: payload.numTurns,
				error: payload.error,
				result: payload.resultText,
			})

			// Release container
			// @ts-expect-error - API types will be generated
			await this.client.mutation("containerPool:release", {
				containerId,
				sessionId: correlationId,
			})

			// Clean up sequence tracking
			sessionSequences.delete(correlationId)
			this.batchBuffer.delete(correlationId)
		} catch (error) {
			console.error("[convex] Failed to record exec complete:", error)
		}
	}

	/**
	 * Record new container created
	 */
	async recordContainerCreated(
		result: CreateContainerResult,
		taskId?: string,
		projectId?: string,
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
			})
		} catch (error) {
			console.error("[convex] Failed to record container created:", error)
		}
	}

	/**
	 * Create a new build record with all phases initialized
	 */
	async createBuild(
		containerId: string,
		request: CreateContainerRequest,
	): Promise<void> {
		try {
			// @ts-expect-error - API types will be generated
			await this.client.mutation("containerBuilds:create", {
				containerId,
				repo: request.repo,
				branch: request.branch || "main",
				server: request.server || "localhost",
				taskId: request.taskId,
				projectId: request.projectId,
			})
		} catch (error) {
			console.error("[convex] Failed to create build:", error)
		}
	}

	/**
	 * Start a build phase
	 */
	async startPhase(containerId: string, phase: string): Promise<void> {
		try {
			// @ts-expect-error - API types will be generated
			await this.client.mutation("containerBuilds:startPhase", {
				containerId,
				phase,
			})
		} catch (error) {
			console.error(`[convex] Failed to start phase ${phase}:`, error)
		}
	}

	/**
	 * Complete a build phase
	 */
	async completePhase(
		containerId: string,
		phase: string,
		logs?: string,
	): Promise<void> {
		try {
			// @ts-expect-error - API types will be generated
			await this.client.mutation("containerBuilds:completePhase", {
				containerId,
				phase,
				logs,
			})
		} catch (error) {
			console.error(`[convex] Failed to complete phase ${phase}:`, error)
		}
	}

	/**
	 * Fail a build at the specified phase
	 */
	async failBuild(
		containerId: string,
		phase: string,
		error: string,
		logs?: string,
	): Promise<void> {
		try {
			// @ts-expect-error - API types will be generated
			await this.client.mutation("containerBuilds:failBuild", {
				containerId,
				phase,
				error,
				logs,
			})
		} catch (error) {
			console.error(`[convex] Failed to record build failure:`, error)
		}
	}

	/**
	 * Append logs to the current phase
	 */
	async appendLogs(
		containerId: string,
		phase: string,
		logs: string,
	): Promise<void> {
		try {
			// @ts-expect-error - API types will be generated
			await this.client.mutation("containerBuilds:appendLogs", {
				containerId,
				phase,
				logs,
			})
		} catch (error) {
			console.error(`[convex] Failed to append logs:`, error)
		}
	}

	/**
	 * Skip a build phase
	 */
	async skipPhase(containerId: string, phase: string): Promise<void> {
		try {
			// @ts-expect-error - API types will be generated
			await this.client.mutation("containerBuilds:skipPhase", {
				containerId,
				phase,
			})
		} catch (error) {
			console.error(`[convex] Failed to skip phase ${phase}:`, error)
		}
	}

	/**
	 * Update container pool health check
	 */
	async updateContainerHealth(containerId: string): Promise<void> {
		try {
			// @ts-expect-error - API types will be generated
			await this.client.mutation("containerPool:updateHealthCheck", {
				containerId,
			})
		} catch (error) {
			console.error("[convex] Failed to update container health:", error)
		}
	}
}
