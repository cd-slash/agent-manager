/**
 * Convex Command Processor
 *
 * Subscribes to the gatewayCommands table and processes commands in real-time.
 * Replaces the REST API endpoints with Convex-driven command processing.
 *
 * ## Queue-Aware Processing
 *
 * Execution commands (startExecution, startPhaseExecution) support queuing:
 * - If a container is available, execute immediately
 * - If no container is available, mark as "queued" and wait
 * - When a container becomes available, process next queued command by priority
 *
 * Priority order: critical > high > normal > low
 * Within same priority, FIFO (oldest first)
 */

import { api } from "@agent-manager/convex/api"
import type { Doc, Id } from "@agent-manager/convex/dataModel"
import { ConvexClient } from "convex/browser"
import type { ConnectionManager } from "./connections"
import type { ConvexSync } from "./convex-sync"
import type { TaskOrchestrator } from "./task-orchestrator"

type GatewayCommand = Doc<"gatewayCommands">

interface CommandProcessorDeps {
	connections: ConnectionManager
	convexSync: ConvexSync | null
	taskOrchestrator: TaskOrchestrator | null
	createContainerOnServer: (
		request: CreateContainerRequest,
		secrets: Record<string, string>,
		buildTracker?: ConvexSync,
		tailscaleConfig?: { tailnetId?: string; apiKey?: string },
	) => Promise<CreateContainerResult>
	fetchSecrets: (
		convexUrl: string,
		keys: string[],
	) => Promise<Record<string, string>>
	fetchTailscaleConfig: (
		convexUrl: string,
	) => Promise<{ tailnetId?: string; apiKey?: string }>
}

interface CreateContainerRequest {
	repo: string
	branch?: string
	name?: string
	server?: string
	sshUser?: string
	taskId?: string
	projectId?: string
}

interface CreateContainerResult {
	name: string
	containerId: string
	hostname: string
	repo: string
	branch: string
	server: string
	network: string
	wgPort?: number
}

interface ExecStartPayload {
	containerId?: string
	message: string
	model?: string
	workingDirectory?: string
	permissionMode?: string
	systemPrompt?: string
	appendSystemPrompt?: string
	allowedTools?: string[]
	disallowedTools?: string[]
	maxBudget?: number
	taskId?: string
	projectId?: string
}

// Commands that require a container for execution
const CONTAINER_COMMANDS = new Set([
	"startExecution",
	"startPhaseExecution",
	"pushAuthToken",
])

/**
 * Processes gateway commands from Convex using real-time subscriptions.
 *
 * Supports two processing modes:
 * 1. Immediate processing: For non-container commands or when containers are available
 * 2. Queue processing: Execution commands wait in queue until a container is free
 */
export class ConvexCommandProcessor {
	private convexUrl: string
	private convexClient: ConvexClient | null = null
	private deps: CommandProcessorDeps
	private processing: Set<string> = new Set()
	private active = false

	// Track active executions for abort handling
	private activeExecutions = new Map<
		string,
		{
			containerId: string
			taskId?: string
			projectId?: string
			startedAt: number
		}
	>()

	// Track queued commands by priority for efficient processing
	private queuedCommands: GatewayCommand[] = []

	// Interval for processing queue when containers become available
	private queueProcessorInterval: ReturnType<typeof setInterval> | null = null
	private readonly QUEUE_CHECK_INTERVAL_MS = 1000

	constructor(convexUrl: string, deps: CommandProcessorDeps) {
		this.convexUrl = convexUrl
		this.deps = deps
	}

	/**
	 * Start processing commands via Convex subscription
	 */
	start(): void {
		if (this.active) {
			console.log("[commands] Command processor already running")
			return
		}

		console.log("[commands] Starting Convex command processor")
		this.convexClient = new ConvexClient(this.convexUrl)
		this.active = true

		// Subscribe to pending commands
		this.convexClient.onUpdate(
			api.gatewayCommands.getPending,
			{},
			(commands) => {
				this.handlePendingCommands(commands ?? [])
			},
		)

		// Subscribe to queued commands
		this.convexClient.onUpdate(
			api.gatewayCommands.getQueued,
			{},
			(commands) => {
				this.queuedCommands = commands ?? []
				console.log(
					`[commands] Queue updated: ${this.queuedCommands.length} commands waiting`,
				)
			},
		)

		// Start queue processor to check for available containers
		this.startQueueProcessor()

		console.log("[commands] Convex command processor active")
	}

	/**
	 * Stop processing commands
	 */
	stop(): void {
		if (this.queueProcessorInterval) {
			clearInterval(this.queueProcessorInterval)
			this.queueProcessorInterval = null
		}
		if (this.convexClient) {
			this.convexClient.close()
			this.convexClient = null
		}
		this.active = false
		console.log("[commands] Convex command processor stopped")
	}

	/**
	 * Start the queue processor that checks for available containers
	 */
	private startQueueProcessor(): void {
		this.queueProcessorInterval = setInterval(() => {
			this.processQueuedCommands()
		}, this.QUEUE_CHECK_INTERVAL_MS)
	}

	/**
	 * Process queued commands when containers become available
	 */
	private async processQueuedCommands(): Promise<void> {
		if (this.queuedCommands.length === 0) return

		// Get available container
		const available = this.deps.connections.findAvailableContainer()
		if (!available) return

		// Get highest priority queued command (already sorted by the query)
		const nextCommand = this.queuedCommands[0]
		if (!nextCommand) return

		// Skip if already being processed
		if (this.processing.has(nextCommand._id)) return

		console.log(
			`[commands] Processing queued command: ${nextCommand.type} (${nextCommand._id}) with container ${available.info.containerId}`,
		)

		this.processing.add(nextCommand._id)

		try {
			// Assign container and process
			if (this.convexClient) {
				await this.convexClient.mutation(api.gatewayCommands.assignContainer, {
					id: nextCommand._id,
					containerId: available.info.containerId,
				})
			}

			// Now process with the assigned container
			const result = await this.executeCommandWithContainer(
				nextCommand,
				available.info.containerId,
			)

			if (this.convexClient) {
				await this.convexClient.mutation(api.gatewayCommands.complete, {
					id: nextCommand._id,
					result,
				})
			}

			console.log(
				`[commands] Queued command completed: ${nextCommand.type} (${nextCommand._id})`,
			)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.error(
				`[commands] Queued command failed: ${nextCommand.type} - ${message}`,
			)
			if (this.convexClient) {
				await this.convexClient.mutation(api.gatewayCommands.fail, {
					id: nextCommand._id,
					error: message,
					canRetry: true, // Allow retry for queued command failures
				})
			}
		} finally {
			this.processing.delete(nextCommand._id)
		}
	}

	/**
	 * Handle incoming pending commands
	 */
	private handlePendingCommands(commands: GatewayCommand[]): void {
		for (const cmd of commands) {
			// Skip if already processing
			if (this.processing.has(cmd._id)) continue

			this.processing.add(cmd._id)
			console.log(`[commands] Processing command: ${cmd.type} (${cmd._id})`)

			this.processCommand(cmd).finally(() => {
				this.processing.delete(cmd._id)
			})
		}
	}

	/**
	 * Process a single command
	 */
	private async processCommand(cmd: GatewayCommand): Promise<void> {
		if (!this.convexClient) return

		// Check if this is a container command that needs queuing
		if (CONTAINER_COMMANDS.has(cmd.type)) {
			// Check if we have a specific container requested
			const payload = cmd.payload as ExecStartPayload
			const specificContainerId = payload.containerId

			// Find available container
			let targetContainerId: string | null = null

			if (specificContainerId) {
				// Check if specific container is available
				const container = this.deps.connections.getContainer(specificContainerId)
				if (container && this.deps.connections.isContainerAvailable(specificContainerId)) {
					targetContainerId = specificContainerId
				}
			} else {
				// Find any available container
				const available = this.deps.connections.findAvailableContainer()
				if (available) {
					targetContainerId = available.info.containerId
				}
			}

			// If no container available, queue the command
			if (!targetContainerId) {
				console.log(
					`[commands] No container available, queuing command: ${cmd.type} (${cmd._id})`,
				)
				await this.convexClient.mutation(api.gatewayCommands.markQueued, {
					id: cmd._id,
					queuePosition: this.queuedCommands.length + 1,
				})
				return
			}

			// Container available, proceed with processing
			await this.convexClient.mutation(api.gatewayCommands.assignContainer, {
				id: cmd._id,
				containerId: targetContainerId,
			})

			try {
				const result = await this.executeCommandWithContainer(
					cmd,
					targetContainerId,
				)
				await this.convexClient.mutation(api.gatewayCommands.complete, {
					id: cmd._id,
					result,
				})
				console.log(`[commands] Command completed: ${cmd.type} (${cmd._id})`)
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				console.error(`[commands] Command failed: ${cmd.type} - ${message}`)
				await this.convexClient.mutation(api.gatewayCommands.fail, {
					id: cmd._id,
					error: message,
					canRetry: true,
				})
			}
			return
		}

		// Non-container commands - process immediately
		try {
			await this.convexClient.mutation(api.gatewayCommands.markProcessing, {
				id: cmd._id,
			})
		} catch (error) {
			console.error(`[commands] Failed to mark command as processing:`, error)
			return
		}

		try {
			const result = await this.executeCommand(cmd)
			await this.convexClient.mutation(api.gatewayCommands.complete, {
				id: cmd._id,
				result,
			})
			console.log(`[commands] Command completed: ${cmd.type} (${cmd._id})`)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.error(`[commands] Command failed: ${cmd.type} - ${message}`)
			await this.convexClient.mutation(api.gatewayCommands.fail, {
				id: cmd._id,
				error: message,
			})
		}
	}

	/**
	 * Execute command based on type
	 */
	private async executeCommand(cmd: GatewayCommand): Promise<unknown> {
		switch (cmd.type) {
			case "createContainer":
				return this.handleCreateContainer(cmd)
			case "stopContainer":
				return this.handleStopContainer(cmd)
			case "deleteContainer":
				return this.handleDeleteContainer(cmd)
			case "startExecution":
				return this.handleStartExecution(cmd)
			case "abortExecution":
				return this.handleAbortExecution(cmd)
			case "pushAuthToken":
				return this.handlePushAuthToken(cmd)
			case "startPhaseExecution":
				return this.handleStartPhaseExecution(cmd)
			default:
				throw new Error(`Unknown command type: ${cmd.type}`)
		}
	}

	/**
	 * Execute a container command with a pre-assigned container
	 */
	private async executeCommandWithContainer(
		cmd: GatewayCommand,
		containerId: string,
	): Promise<unknown> {
		switch (cmd.type) {
			case "startExecution":
				return this.handleStartExecutionWithContainer(cmd, containerId)
			case "startPhaseExecution":
				return this.handleStartPhaseExecutionWithContainer(cmd, containerId)
			case "pushAuthToken":
				return this.handlePushAuthTokenWithContainer(cmd, containerId)
			default:
				throw new Error(
					`Command type ${cmd.type} does not support container assignment`,
				)
		}
	}

	// ==========================================================================
	// Server Commands (SSH/Docker)
	// ==========================================================================

	private async handleCreateContainer(cmd: GatewayCommand): Promise<unknown> {
		const payload = cmd.payload as CreateContainerRequest

		// Repo is now optional - management containers don't need one
		console.log(`[commands] Creating container${payload.repo ? ` for repo: ${payload.repo}` : " (no repo)"}`)

		// Fetch secrets from Convex (GH creds only needed if cloning a repo)
		const secrets = await this.deps.fetchSecrets(this.convexUrl, [
			"GH_USERNAME",
			"GH_TOKEN",
		])

		// Validate required secrets only if repo is specified
		if (payload.repo) {
			const requiredSecrets = ["GH_USERNAME", "GH_TOKEN"]
			const missingSecrets = requiredSecrets.filter((key) => !secrets[key])
			if (missingSecrets.length > 0) {
				throw new Error(`Missing required secrets for repo cloning: ${missingSecrets.join(", ")}`)
			}
		}

		// Fetch Tailscale config (required for generating auth keys)
		const tailscaleConfig = await this.deps.fetchTailscaleConfig(this.convexUrl)

		const result = await this.deps.createContainerOnServer(
			{
				...payload,
				taskId: cmd.taskId,
				projectId: cmd.projectId,
			},
			secrets,
			this.deps.convexSync ?? undefined,
			tailscaleConfig,
		)

		// Record in Convex
		if (this.deps.convexSync) {
			this.deps.convexSync.recordContainerCreated(
				result,
				cmd.taskId,
				cmd.projectId,
			)
		}

		return result
	}

	private async handleStopContainer(cmd: GatewayCommand): Promise<unknown> {
		const payload = cmd.payload as {
			containerName: string
			server: string
			sshUser?: string
		}

		if (!payload.server) {
			throw new Error("server is required")
		}

		console.log(
			`[commands] Stopping container ${payload.containerName} on ${payload.server}`,
		)

		const sshTarget =
			payload.server === "localhost"
				? "localhost"
				: `${payload.sshUser || "ubuntu"}@${payload.server}`

		const stopScript = `
CONTAINER_ID=$(docker ps -aq --filter "label=agent-manager.tailscale-hostname=${payload.containerName}" | head -1)
if [ -z "$CONTAINER_ID" ]; then
  CONTAINER_ID="${payload.containerName}"
fi
docker stop "$CONTAINER_ID"
`

		const stopProc =
			payload.server === "localhost"
				? Bun.spawn(["bash", "-c", stopScript], {
						stdout: "pipe",
						stderr: "pipe",
					})
				: Bun.spawn(["ssh", sshTarget, "bash", "-s"], {
						stdin: new Blob([stopScript]),
						stdout: "pipe",
						stderr: "pipe",
					})

		const stdout = await new Response(stopProc.stdout).text()
		const stderr = await new Response(stopProc.stderr).text()
		const exitCode = await stopProc.exited

		if (exitCode !== 0) {
			throw new Error(`Failed to stop container: ${stderr}`)
		}

		return {
			status: "stopped",
			containerName: payload.containerName,
			output: stdout.trim(),
		}
	}

	private async handleDeleteContainer(cmd: GatewayCommand): Promise<unknown> {
		const payload = cmd.payload as {
			containerName: string
			server: string
			sshUser?: string
		}

		if (!payload.server) {
			throw new Error("server is required")
		}

		console.log(
			`[commands] Deleting container ${payload.containerName} on ${payload.server}`,
		)

		const sshTarget =
			payload.server === "localhost"
				? "localhost"
				: `${payload.sshUser || "ubuntu"}@${payload.server}`

		const deleteScript = `
CONTAINER_ID=$(docker ps -aq --filter "label=agent-manager.tailscale-hostname=${payload.containerName}" | head -1)
if [ -z "$CONTAINER_ID" ]; then
  CONTAINER_ID="${payload.containerName}"
fi

# Check if container exists
if ! docker inspect "$CONTAINER_ID" >/dev/null 2>&1; then
  echo "NOT_FOUND"
  exit 0
fi

# Check if container is running
RUNNING=$(docker inspect --format='{{.State.Running}}' "$CONTAINER_ID" 2>/dev/null || echo "false")
if [ "$RUNNING" = "true" ]; then
  echo "STILL_RUNNING"
  exit 1
fi

# Delete the container
docker rm "$CONTAINER_ID"
`

		const deleteProc =
			payload.server === "localhost"
				? Bun.spawn(["bash", "-c", deleteScript], {
						stdout: "pipe",
						stderr: "pipe",
					})
				: Bun.spawn(["ssh", sshTarget, "bash", "-s"], {
						stdin: new Blob([deleteScript]),
						stdout: "pipe",
						stderr: "pipe",
					})

		const stdout = (await new Response(deleteProc.stdout).text()).trim()
		const stderr = await new Response(deleteProc.stderr).text()
		const exitCode = await deleteProc.exited

		if (stdout === "NOT_FOUND") {
			throw new Error("Container not found")
		}

		if (stdout === "STILL_RUNNING" || exitCode !== 0) {
			if (stdout === "STILL_RUNNING") {
				throw new Error("Container is running. Stop it first before deleting.")
			}
			throw new Error(`Failed to delete container: ${stderr}`)
		}

		return {
			status: "deleted",
			containerName: payload.containerName,
			output: stdout,
		}
	}

	// ==========================================================================
	// Container Commands (WebSocket) - Legacy handlers for direct execution
	// ==========================================================================

	private async handleStartExecution(cmd: GatewayCommand): Promise<unknown> {
		const payload = cmd.payload as ExecStartPayload

		// Find container (specific or available)
		let targetContainerId = payload.containerId
		if (!targetContainerId) {
			const available = this.deps.connections.findAvailableContainer()
			if (!available) {
				throw new Error("No available containers")
			}
			targetContainerId = available.info.containerId
		}

		return this.handleStartExecutionWithContainer(cmd, targetContainerId)
	}

	private async handleStartExecutionWithContainer(
		cmd: GatewayCommand,
		targetContainerId: string,
	): Promise<unknown> {
		const payload = cmd.payload as ExecStartPayload

		const container = this.deps.connections.getContainer(targetContainerId)
		if (!container) {
			throw new Error("Container not found")
		}

		const correlationId = cmd.correlationId || crypto.randomUUID()

		// Track the execution
		this.activeExecutions.set(correlationId, {
			containerId: targetContainerId,
			taskId: cmd.taskId,
			projectId: cmd.projectId,
			startedAt: Date.now(),
		})

		// Send exec:start to container
		const sent = this.deps.connections.sendToContainer(
			targetContainerId,
			"exec:start",
			{
				...payload,
				taskId: cmd.taskId,
				projectId: cmd.projectId,
			},
			correlationId,
		)

		if (!sent) {
			this.activeExecutions.delete(correlationId)
			throw new Error("Failed to send to container")
		}

		// Record in Convex
		if (this.deps.convexSync) {
			this.deps.convexSync.recordExecStart(
				correlationId,
				targetContainerId,
				{
					...payload,
					taskId: cmd.taskId,
					projectId: cmd.projectId,
				},
				cmd.taskId,
				cmd.projectId,
			)
		}

		return {
			correlationId,
			containerId: targetContainerId,
			status: "started",
		}
	}

	private async handleAbortExecution(cmd: GatewayCommand): Promise<unknown> {
		const payload = cmd.payload as { correlationId: string }

		const execution = this.activeExecutions.get(payload.correlationId)
		if (!execution) {
			throw new Error("Execution not found")
		}

		// TODO: Send abort message to container
		// this.deps.connections.sendToContainer(execution.containerId, "exec:abort", { processId: ? })

		return { status: "abort_requested" }
	}

	private async handlePushAuthToken(cmd: GatewayCommand): Promise<unknown> {
		const payload = cmd.payload as { containerId: string; token: string }
		return this.handlePushAuthTokenWithContainer(cmd, payload.containerId)
	}

	private async handlePushAuthTokenWithContainer(
		cmd: GatewayCommand,
		containerId: string,
	): Promise<unknown> {
		const payload = cmd.payload as { token: string }

		const sent = this.deps.connections.sendToContainer(
			containerId,
			"auth:request",
			{ token: payload.token },
		)

		if (!sent) {
			throw new Error("Container not found or not connected")
		}

		return { status: "token_sent" }
	}

	// ==========================================================================
	// Task Orchestration
	// ==========================================================================

	private async handleStartPhaseExecution(
		cmd: GatewayCommand,
	): Promise<unknown> {
		if (!this.deps.taskOrchestrator) {
			throw new Error("Task orchestrator not configured")
		}

		const payload = cmd.payload as {
			taskId: string
			phase: string
			containerId?: string
			customPrompt?: string
			configOverrides?: Record<string, unknown>
		}

		// Find available container if not specified
		let containerId = payload.containerId
		if (!containerId) {
			const available = this.deps.connections.findAvailableContainer()
			if (!available) {
				throw new Error("No available containers")
			}
			containerId = available.info.containerId
		}

		return this.handleStartPhaseExecutionWithContainer(cmd, containerId)
	}

	private async handleStartPhaseExecutionWithContainer(
		cmd: GatewayCommand,
		containerId: string,
	): Promise<unknown> {
		if (!this.deps.taskOrchestrator) {
			throw new Error("Task orchestrator not configured")
		}

		const payload = cmd.payload as {
			taskId: string
			phase: string
			customPrompt?: string
			configOverrides?: Record<string, unknown>
		}

		const result = await this.deps.taskOrchestrator.startPhaseExecution({
			taskId: payload.taskId,
			phase: payload.phase as
				| "requirements"
				| "planning"
				| "implementation"
				| "ai_review"
				| "remediation"
				| "human_review"
				| "merge",
			containerId,
			customPrompt: payload.customPrompt,
			configOverrides: payload.configOverrides,
		})

		if (!result.success) {
			throw new Error(result.error || "Failed to start phase execution")
		}

		return {
			correlationId: result.correlationId,
			containerId: result.containerId,
			taskId: payload.taskId,
			phase: payload.phase,
			status: "started",
		}
	}

	// ==========================================================================
	// Execution tracking (called from gateway message handler)
	// ==========================================================================

	/**
	 * Get an active execution by correlation ID
	 */
	getActiveExecution(correlationId: string) {
		return this.activeExecutions.get(correlationId)
	}

	/**
	 * Remove an active execution (called when execution completes)
	 */
	removeActiveExecution(correlationId: string): void {
		this.activeExecutions.delete(correlationId)
	}

	/**
	 * Get all active executions
	 */
	getAllActiveExecutions() {
		return Array.from(this.activeExecutions.entries()).map(
			([correlationId, data]) => ({
				correlationId,
				...data,
			}),
		)
	}

	/**
	 * Notify that a container has become available
	 * Called by the connection manager when a container finishes execution
	 */
	notifyContainerAvailable(containerId: string): void {
		console.log(
			`[commands] Container ${containerId} available, checking queue...`,
		)
		// The queue processor will pick this up on the next tick
		// This could be optimized to process immediately if desired
	}

	/**
	 * Get queue status for monitoring
	 */
	getQueueStatus() {
		return {
			queuedCount: this.queuedCommands.length,
			processingCount: this.processing.size,
			activeExecutionsCount: this.activeExecutions.size,
			queuedByPriority: {
				critical: this.queuedCommands.filter((c) => c.priority === "critical")
					.length,
				high: this.queuedCommands.filter((c) => c.priority === "high").length,
				normal: this.queuedCommands.filter((c) => c.priority === "normal")
					.length,
				low: this.queuedCommands.filter((c) => c.priority === "low").length,
			},
		}
	}
}
