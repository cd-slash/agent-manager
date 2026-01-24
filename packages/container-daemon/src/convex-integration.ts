/**
 * Convex Integration for Container API
 *
 * Connects directly to Convex to:
 * - Register this container in the containerPool
 * - Watch for commands assigned to this container
 * - Execute commands and stream results back to Convex
 * - Handle heartbeats and health updates
 */

import { api } from "@agent-manager/convex/api"
import { ConvexClient } from "convex/browser"
import type { Doc, Id } from "@agent-manager/convex/dataModel"
import { EventEmitter } from "node:events"
import type { AuthManager } from "./auth-manager"
import type { ProcessManager } from "./process-manager"

type ContainerCommand = Doc<"containerCommands">

interface ConvexIntegrationConfig {
	convexUrl: string
	containerId: string
	hostname: string
	capabilities?: string[]
}

interface ConvexIntegrationEvents {
	connected: []
	disconnected: []
	error: [Error]
	"command:received": [ContainerCommand]
	"command:completed": [string, unknown]
	"command:failed": [string, string]
}

export class ConvexIntegration extends EventEmitter<ConvexIntegrationEvents> {
	private client: ConvexClient
	private config: ConvexIntegrationConfig
	private authManager: AuthManager
	private processManager: ProcessManager
	private connected = false
	private heartbeatInterval: Timer | null = null
	private commandUnsubscribe: (() => void) | null = null
	private processingCommands = new Set<string>()

	constructor(
		config: ConvexIntegrationConfig,
		authManager: AuthManager,
		processManager: ProcessManager,
	) {
		super()
		this.config = config
		this.authManager = authManager
		this.processManager = processManager
		this.client = new ConvexClient(config.convexUrl)
	}

	async connect(): Promise<void> {
		console.log(`[convex] Connecting to Convex: ${this.config.convexUrl}`)

		try {
			// Register this container in the pool
			await this.client.mutation(api.containerPool.register, {
				containerId: this.config.containerId,
				hostname: this.config.hostname,
				capabilities: this.config.capabilities || ["claude", "exec"],
				maxConcurrent: 1,
			})

			console.log(`[convex] Container registered: ${this.config.containerId}`)
			this.connected = true
			this.emit("connected")

			// Start heartbeat
			this.startHeartbeat()

			// Subscribe to commands assigned to this container
			this.subscribeToCommands()

			// Watch for auth token updates
			this.subscribeToAuthToken()
		} catch (error) {
			console.error("[convex] Failed to connect:", error)
			this.emit("error", error instanceof Error ? error : new Error(String(error)))
			throw error
		}
	}

	async disconnect(): Promise<void> {
		console.log("[convex] Disconnecting from Convex...")

		// Stop heartbeat
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval)
			this.heartbeatInterval = null
		}

		// Unsubscribe from commands
		if (this.commandUnsubscribe) {
			this.commandUnsubscribe()
			this.commandUnsubscribe = null
		}

		// Mark container as offline in pool
		try {
			await this.client.mutation(api.containerPool.markOffline, {
				containerId: this.config.containerId,
			})
		} catch (error) {
			console.error("[convex] Failed to mark offline:", error)
		}

		this.connected = false
		this.emit("disconnected")
		await this.client.close()
	}

	private startHeartbeat(): void {
		// Update health check every 30 seconds
		this.heartbeatInterval = setInterval(async () => {
			try {
				await this.client.mutation(api.containerPool.updateHealthCheck, {
					containerId: this.config.containerId,
				})
			} catch (error) {
				console.error("[convex] Heartbeat failed:", error)
			}
		}, 30000)
	}

	private subscribeToCommands(): void {
		// Subscribe to commands targeted at this container
		this.commandUnsubscribe = this.client.onUpdate(
			api.containerCommands.getForContainer,
			{ containerId: this.config.containerId },
			(commands) => {
				if (!commands) return

				for (const command of commands) {
					// Only process pending commands we haven't started
					if (
						command.status === "pending" &&
						!this.processingCommands.has(command._id)
					) {
						this.handleCommand(command)
					}
				}
			},
		)
	}

	private subscribeToAuthToken(): void {
		// Watch for auth token updates in secrets
		// Support both CLAUDE_CODE_OAUTH_TOKEN (preferred) and legacy ANTHROPIC_AUTH_TOKEN
		this.client.onUpdate(
			api.secrets.get,
			{ key: "CLAUDE_CODE_OAUTH_TOKEN" },
			async (secret) => {
				if (secret?.value) {
					console.log("[convex] Received OAuth token update (CLAUDE_CODE_OAUTH_TOKEN)")
					try {
						await this.authManager.setToken(secret.value)
					} catch (error) {
						console.error("[convex] Failed to set auth token:", error)
					}
				}
			},
		)
		// Also check legacy key on startup
		this.client.onUpdate(
			api.secrets.get,
			{ key: "ANTHROPIC_AUTH_TOKEN" },
			async (secret) => {
				// Only use legacy key if new key doesn't exist
				const newKey = await this.client.query(api.secrets.get, { key: "CLAUDE_CODE_OAUTH_TOKEN" })
				if (!newKey?.value && secret?.value) {
					console.log("[convex] Received OAuth token update (legacy ANTHROPIC_AUTH_TOKEN)")
					try {
						await this.authManager.setToken(secret.value)
					} catch (error) {
						console.error("[convex] Failed to set auth token:", error)
					}
				}
			},
		)
	}

	private async handleCommand(command: ContainerCommand): Promise<void> {
		const commandId = command._id
		this.processingCommands.add(commandId)
		this.emit("command:received", command)

		console.log(`[convex] Processing command: ${command.type} (${commandId})`)

		try {
			// Mark command as processing
			await this.client.mutation(api.containerCommands.markProcessing, {
				id: commandId,
			})

			let result: unknown

			switch (command.type) {
				case "startExecution":
					result = await this.handleStartExecution(command)
					break

				case "startPhaseExecution":
					result = await this.handleStartPhaseExecution(command)
					break

				case "pushAuthToken":
					result = await this.handlePushAuthToken(command)
					break

				case "abortExecution":
					result = await this.handleAbortExecution(command)
					break

				case "startOAuthFlow":
					result = await this.handleStartOAuthFlow(command)
					break

				case "completeOAuthFlow":
					result = await this.handleCompleteOAuthFlow(command)
					break

				default:
					throw new Error(`Unknown command type: ${command.type}`)
			}

			// Mark command as completed
			await this.client.mutation(api.containerCommands.complete, {
				id: commandId,
				result,
			})

			console.log(`[convex] Command completed: ${command.type} (${commandId})`)
			this.emit("command:completed", commandId, result)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.error(`[convex] Command failed: ${command.type} (${commandId}):`, message)

			// Mark command as failed
			await this.client.mutation(api.containerCommands.fail, {
				id: commandId,
				error: message,
			})

			this.emit("command:failed", commandId, message)
		} finally {
			this.processingCommands.delete(commandId)

			// Release container back to idle
			await this.client.mutation(api.containerPool.release, {
				containerId: this.config.containerId,
			})
		}
	}

	private async handleStartExecution(command: ContainerCommand): Promise<unknown> {
		const payload = command.payload as {
			message: string
			model?: string
			provider?: string
			envVars?: {
				ANTHROPIC_AUTH_TOKEN?: string
				ANTHROPIC_BASE_URL?: string
				API_TIMEOUT_MS?: string
			}
			workingDirectory?: string
			permissionMode?: string
			systemPrompt?: string
			allowedTools?: string[]
			disallowedTools?: string[]
			sessionId?: string
			taskId?: string
			projectId?: string
		}

		const correlationId = command.correlationId || crypto.randomUUID()
		let sequenceNumber = 0
		let finalResult: string | undefined
		const accumulatedTextParts: string[] = []

		// taskId can be in payload or on the command itself
		const taskId = payload.taskId || command.taskId
		const projectId = payload.projectId || command.projectId

		// Create an agent session to track this execution
		try {
			await this.client.mutation(api.agentSessions.create, {
				sessionId: correlationId,
				containerId: this.config.containerId,
				prompt: payload.message,
				taskId: taskId as Id<"tasks"> | undefined,
				projectId: projectId as Id<"projects"> | undefined,
				status: "running",
				startedAt: Date.now(),
			})
			console.log(`[convex] Created agent session: ${correlationId}`)
		} catch (error) {
			console.error(`[convex] Failed to create agent session:`, error)
		}

		// Stream execution results to Convex
		for await (const event of this.processManager.executeStream({
			message: payload.message,
			model: payload.model,
			provider: payload.provider,
			envVars: payload.envVars,
			workingDirectory: payload.workingDirectory,
			permissionMode: payload.permissionMode,
			systemPrompt: payload.systemPrompt,
			allowedTools: payload.allowedTools,
			disallowedTools: payload.disallowedTools,
			sessionId: payload.sessionId,
		})) {
			// Store each message in Convex
			if (event.type === "data" && event.data) {
				// event.data is already a parsed object from the process manager
				const data = event.data as {
					type?: string
					result?: string
					message?: {
						content?: Array<{ type: string; text?: string }>
					}
				}

				// Store the JSON string in Convex
				await this.client.mutation(api.agentMessages.create, {
					sessionId: correlationId,
					content: JSON.stringify(data),
					sequenceNumber: sequenceNumber++,
				})

				// Extract the final result text from the result event
				if (data.type === "result" && data.result) {
					finalResult = data.result
				}

				// Also accumulate text from assistant messages as fallback
				if (data.type === "assistant" && data.message?.content) {
					for (const block of data.message.content) {
						if (block.type === "text" && block.text) {
							accumulatedTextParts.push(block.text)
						}
					}
				}
			}
		}

		// Determine the best response text
		// Prefer the explicit result, fall back to accumulated text
		const responseText = finalResult || accumulatedTextParts.join("")

		// If we have a task and any response, insert it as an AI chat message
		if (taskId && responseText) {
			try {
				await this.client.mutation(api.chat.sendTaskMessage, {
					taskId: taskId as Id<"tasks">,
					text: responseText,
					sender: "ai",
					model: payload.model,
					provider: payload.provider,
				})
				console.log(`[convex] AI response added to chat for task ${taskId}`)
			} catch (error) {
				console.error(`[convex] Failed to add AI chat message:`, error)
			}
		}

		// Update the agent session status
		try {
			await this.client.mutation(api.agentSessions.updateStatus, {
				sessionId: correlationId,
				status: "completed",
				result: responseText || undefined,
				completedAt: Date.now(),
			})
		} catch (error) {
			console.error(`[convex] Failed to update agent session status:`, error)
		}

		return { correlationId, status: "completed" }
	}

	private async handleStartPhaseExecution(command: ContainerCommand): Promise<unknown> {
		const payload = command.payload as {
			taskId: string
			phase: string
			customPrompt?: string
			configOverrides?: {
				model?: string
				permissionMode?: string
			}
		}

		// Get phase configuration from Convex
		const phaseConfig = await this.client.query(api.taskPhases.getPhase, {
			taskId: payload.taskId as Id<"tasks">,
			phase: payload.phase as "requirements" | "planning" | "implementation" | "ai_review" | "remediation" | "human_review" | "merge",
		})

		if (!phaseConfig) {
			throw new Error(`Phase ${payload.phase} not found for task ${payload.taskId}`)
		}

		const prompt = payload.customPrompt || phaseConfig.prompt || `Execute ${payload.phase} phase`
		const model = payload.configOverrides?.model || phaseConfig.model

		// Execute the phase
		return await this.handleStartExecution({
			...command,
			payload: {
				message: prompt,
				model,
				permissionMode: payload.configOverrides?.permissionMode,
				taskId: payload.taskId,
			},
		})
	}

	private async handlePushAuthToken(command: ContainerCommand): Promise<unknown> {
		const payload = command.payload as { token: string }

		if (!payload.token) {
			throw new Error("Token is required")
		}

		await this.authManager.setToken(payload.token)
		return { success: true }
	}

	private async handleAbortExecution(command: ContainerCommand): Promise<unknown> {
		const payload = command.payload as { correlationId?: string; processId?: number }

		if (payload.processId) {
			const success = this.processManager.abort(payload.processId)
			return { success }
		}

		// If no specific processId, abort all
		this.processManager.abortAll()
		return { success: true, abortedAll: true }
	}

	private async handleStartOAuthFlow(command: ContainerCommand): Promise<unknown> {
		const payload = command.payload as {
			provider: string
			oauthFlowId: string
		}

		console.log(`[convex] Starting OAuth flow for provider: ${payload.provider}`)

		try {
			const result = await this.authManager.startOAuthFlow()
			return {
				success: true,
				flowId: result.flowId,
				url: result.url,
				expiresIn: result.expiresIn,
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.error(`[convex] OAuth flow start failed: ${message}`)
			return { success: false, error: message }
		}
	}

	private async handleCompleteOAuthFlow(command: ContainerCommand): Promise<unknown> {
		const payload = command.payload as {
			oauthFlowId: string
			containerFlowId: string
			authCode: string
		}

		console.log(`[convex] Completing OAuth flow: ${payload.containerFlowId}`)

		try {
			const result = await this.authManager.completeOAuthFlow(
				payload.containerFlowId,
				payload.authCode,
			)

			if (result.success && result.token) {
				// Store the token in Convex secrets
				await this.client.mutation(api.secrets.set, {
					key: "ANTHROPIC_AUTH_TOKEN",
					value: result.token,
					description: "Claude OAuth token",
				})
				console.log(`[convex] OAuth token stored in Convex secrets`)
			}

			return {
				success: result.success,
				hasToken: !!result.token,
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.error(`[convex] OAuth flow completion failed: ${message}`)
			return { success: false, error: message }
		}
	}

	getState(): { connected: boolean; containerId: string } {
		return {
			connected: this.connected,
			containerId: this.config.containerId,
		}
	}
}
