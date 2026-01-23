/**
 * Server Command Processor
 *
 * Subscribes to the serverCommands table and processes server-side operations.
 * Only handles infrastructure commands that require SSH/Docker access:
 * - createContainer: Create a new container via SSH/Docker
 * - stopContainer: Stop a running container
 * - deleteContainer: Remove a container
 *
 * Container-targeted commands (startExecution, OAuth, etc.) are now handled
 * directly by containers via the containerCommands table.
 */

import { api } from "@agent-manager/convex/api"
import type { Doc } from "@agent-manager/convex/dataModel"
import { ConvexClient } from "convex/browser"
import type { ConvexSync } from "./convex-sync"

type ServerCommand = Doc<"serverCommands">

interface CommandProcessorDeps {
	convexSync: ConvexSync | null
	generateContainerName: () => string
	createContainerOnServer: (
		request: CreateContainerRequest,
		secrets: Record<string, string>,
		buildTracker?: ConvexSync,
		tailscaleConfig?: { tailnetId?: string; apiKey?: string },
	) => Promise<CreateContainerResult>
	stopContainerOnServer: (
		containerName: string,
		server: string,
		sshUser?: string,
	) => Promise<{ stopped: boolean; notFound: boolean }>
	restartContainerOnServer: (
		containerName: string,
		server: string,
		sshUser?: string,
		tailscaleConfig?: { tailnetId?: string; apiKey?: string },
	) => Promise<{ restarted: boolean; notFound: boolean }>
	deleteContainerOnServer: (
		containerName: string,
		server: string,
		sshUser?: string,
	) => Promise<void>
	listContainersOnServer: (
		server: string,
		sshUser?: string,
	) => Promise<Array<{ name: string; containerId: string; running: boolean }>>
	fetchSecrets: (
		convexUrl: string,
		keys: string[],
	) => Promise<Record<string, string>>
	fetchTailscaleConfig: (
		convexUrl: string,
	) => Promise<{ tailnetId?: string; apiKey?: string }>
	recordContainerCreated?: (
		result: CreateContainerResult,
		taskId?: string,
		projectId?: string,
	) => Promise<void>
}

interface CreateContainerRequest {
	repo?: string
	branch?: string
	name?: string
	server?: string
	sshUser?: string
	taskId?: string
	projectId?: string
	containerType?: string
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

/**
 * Processes server commands from Convex using real-time subscriptions.
 * Only handles infrastructure operations (create/stop/delete containers).
 */
export class ConvexCommandProcessor {
	private convexUrl: string
	private convexClient: ConvexClient | null = null
	private deps: CommandProcessorDeps
	private processing: Set<string> = new Set()
	private active = false

	constructor(convexUrl: string, deps: CommandProcessorDeps) {
		this.convexUrl = convexUrl
		this.deps = deps
	}

	/**
	 * Start processing server commands via Convex subscription
	 */
	start(): void {
		if (this.active) {
			console.log("[commands] Command processor already running")
			return
		}

		console.log("[commands] Starting server command processor")
		this.convexClient = new ConvexClient(this.convexUrl)
		this.active = true

		// Subscribe to pending server commands
		this.convexClient.onUpdate(
			api.serverCommands.getPending,
			{},
			(commands) => {
				this.handlePendingCommands(commands ?? [])
			},
		)

		console.log("[commands] Server command processor active")
	}

	/**
	 * Stop processing commands
	 */
	stop(): void {
		if (this.convexClient) {
			this.convexClient.close()
			this.convexClient = null
		}
		this.active = false
		console.log("[commands] Server command processor stopped")
	}

	/**
	 * Handle incoming pending commands
	 */
	private handlePendingCommands(commands: ServerCommand[]): void {
		for (const cmd of commands) {
			// Skip if already processing
			if (this.processing.has(cmd._id)) continue

			this.processing.add(cmd._id)
			console.log(`[commands] Processing server command: ${cmd.type} (${cmd._id})`)

			this.processCommand(cmd).finally(() => {
				this.processing.delete(cmd._id)
			})
		}
	}

	/**
	 * Process a single server command
	 */
	private async processCommand(cmd: ServerCommand): Promise<void> {
		if (!this.convexClient) return

		try {
			// Mark as processing
			await this.convexClient.mutation(api.serverCommands.markProcessing, {
				id: cmd._id,
			})

			// Execute based on type
			const result = await this.executeCommand(cmd)

			// Mark as completed
			await this.convexClient.mutation(api.serverCommands.complete, {
				id: cmd._id,
				result,
			})

			console.log(`[commands] Server command completed: ${cmd.type} (${cmd._id})`)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.error(`[commands] Server command failed: ${cmd.type} - ${message}`)

			if (this.convexClient) {
				await this.convexClient.mutation(api.serverCommands.fail, {
					id: cmd._id,
					error: message,
					canRetry: true,
				})
			}
		}
	}

	/**
	 * Execute command based on type
	 */
	private async executeCommand(cmd: ServerCommand): Promise<unknown> {
		switch (cmd.type) {
			case "createContainer":
				return this.handleCreateContainer(cmd)
			case "stopContainer":
				return this.handleStopContainer(cmd)
			case "restartContainer":
				return this.handleRestartContainer(cmd)
			case "deleteContainer":
				return this.handleDeleteContainer(cmd)
			case "listContainers":
				return this.handleListContainers(cmd)
			default:
				throw new Error(`Unknown server command type: ${cmd.type}`)
		}
	}

	// ==========================================================================
	// Server Commands (SSH/Docker)
	// ==========================================================================

	private async handleCreateContainer(cmd: ServerCommand): Promise<unknown> {
		let payload = cmd.payload as CreateContainerRequest

		// Get taskId and projectId from command (not just payload)
		const taskId = cmd.taskId ?? payload.taskId
		const projectId = cmd.projectId ?? payload.projectId

		// Generate and store container name if not already set
		// This ensures retries use the same name instead of creating new containers
		if (!payload.name) {
			const generatedName = this.deps.generateContainerName()
			payload = { ...payload, name: generatedName }

			// Persist the generated name to the command so retries use the same name
			if (this.convexClient) {
				await this.convexClient.mutation(api.serverCommands.updatePayload, {
					id: cmd._id,
					payload,
				})
			}

			console.log(
				`[commands] Generated container name: ${generatedName}`,
			)
		}

		console.log(
			`[commands] Creating container "${payload.name}"${payload.repo ? ` for repo: ${payload.repo}` : " (no repo)"}${taskId ? ` for task: ${taskId}` : ""}`,
		)

		// Fetch secrets from Convex (GH creds only needed if cloning a repo)
		const secretKeys = payload.repo ? ["GH_USERNAME", "GH_TOKEN"] : []
		const secrets =
			secretKeys.length > 0
				? await this.deps.fetchSecrets(this.convexUrl, secretKeys)
				: {}

		// Fetch Tailscale config for ephemeral auth key generation
		const tailscaleConfig = await this.deps.fetchTailscaleConfig(this.convexUrl)

		const result = await this.deps.createContainerOnServer(
			payload,
			secrets,
			this.deps.convexSync ?? undefined,
			tailscaleConfig,
		)

		console.log(`[commands] Container created: ${result.name}`)

		// Record the container in Convex (this sets task.activeContainerId)
		if (this.deps.recordContainerCreated) {
			await this.deps.recordContainerCreated(result, taskId, projectId)
			console.log(`[commands] Container registered in Convex${taskId ? ` for task ${taskId}` : ""}`)
		}

		return result
	}

	private async handleStopContainer(cmd: ServerCommand): Promise<unknown> {
		const payload = cmd.payload as {
			containerName: string
			server: string
			sshUser?: string
		}

		console.log(`[commands] Stopping container: ${payload.containerName}`)

		const result = await this.deps.stopContainerOnServer(
			payload.containerName,
			payload.server,
			payload.sshUser,
		)

		if (result.notFound) {
			console.log(
				`[commands] Container not found on host: ${payload.containerName}`,
			)
		} else {
			console.log(`[commands] Container stopped: ${payload.containerName}`)
		}

		return {
			stopped: result.stopped,
			notFound: result.notFound,
			containerName: payload.containerName,
		}
	}

	private async handleRestartContainer(cmd: ServerCommand): Promise<unknown> {
		const payload = cmd.payload as {
			containerName: string
			server: string
			sshUser?: string
		}

		console.log(`[commands] Restarting container: ${payload.containerName}`)

		// Fetch Tailscale config for fresh auth key generation
		const tailscaleConfig = await this.deps.fetchTailscaleConfig(this.convexUrl)

		const result = await this.deps.restartContainerOnServer(
			payload.containerName,
			payload.server,
			payload.sshUser,
			tailscaleConfig,
		)

		if (result.notFound) {
			console.log(
				`[commands] Container not found on host: ${payload.containerName}`,
			)
		} else {
			console.log(`[commands] Container restarted: ${payload.containerName}`)
		}

		return {
			restarted: result.restarted,
			notFound: result.notFound,
			containerName: payload.containerName,
		}
	}

	private async handleDeleteContainer(cmd: ServerCommand): Promise<unknown> {
		const payload = cmd.payload as {
			containerName: string
			server: string
			sshUser?: string
		}

		console.log(`[commands] Deleting container: ${payload.containerName}`)

		await this.deps.deleteContainerOnServer(
			payload.containerName,
			payload.server,
			payload.sshUser,
		)

		console.log(`[commands] Container deleted: ${payload.containerName}`)
		return { deleted: true, containerName: payload.containerName }
	}

	private async handleListContainers(cmd: ServerCommand): Promise<unknown> {
		const payload = cmd.payload as {
			server: string
			sshUser?: string
		}

		console.log(`[commands] Listing containers on: ${payload.server}`)

		const containers = await this.deps.listContainersOnServer(
			payload.server,
			payload.sshUser,
		)

		console.log(
			`[commands] Found ${containers.length} containers on ${payload.server}`,
		)
		return { containers, server: payload.server }
	}
}
