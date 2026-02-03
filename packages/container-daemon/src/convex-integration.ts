/**
 * Convex Integration for Container API
 *
 * Connects directly to Convex to:
 * - Register this container in the containerPool
 * - Watch for commands assigned to this container
 * - Execute commands and stream results back to Convex
 * - Handle heartbeats and health updates
 */

import { EventEmitter } from "node:events"
import { api } from "@agent-manager/convex/api"
import type { Doc, Id } from "@agent-manager/convex/dataModel"
import { ConvexClient } from "convex/browser"
import { OpencodeRunner } from "./opencode-runner"

type ContainerCommand = Doc<"containerCommands">

/**
 * Format API error messages to be more user-friendly
 * Parses messages like: "API Error: 401 {"error":{"code":"1004","message":"Invalid API Key"},...} · Please run /login"
 * Into: "Authentication Failed (401): Invalid API Key"
 */
function formatApiError(rawError: string): string {
	// Try to extract the JSON error payload
	const jsonMatch = rawError.match(
		/\{[^{}]*"error"[^{}]*\{[^{}]*"message"\s*:\s*"([^"]+)"/,
	)
	const statusMatch = rawError.match(/API Error:\s*(\d+)/)
	const status = statusMatch?.[1]
	const message = jsonMatch?.[1]

	if (message) {
		// Map common status codes to friendly names
		const statusName =
			status === "401"
				? "Authentication Failed"
				: status === "403"
					? "Access Denied"
					: status === "429"
						? "Rate Limited"
						: status === "500"
							? "Server Error"
							: status
								? `Error ${status}`
								: "API Error"

		return `${statusName}: ${message}`
	}

	// If we can't parse it, clean up the raw message
	// Remove duplicate occurrences of the error (common with CLI output)
	const cleaned = rawError.replace(/(.+)(\s*\1)+/g, "$1").trim()
	return cleaned
}

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
	private opencodeRunner: OpencodeRunner
	private connected = false
	private heartbeatInterval: Timer | null = null
	private commandUnsubscribe: (() => void) | null = null
	private processingCommands = new Set<string>()

	constructor(config: ConvexIntegrationConfig) {
		super()
		this.config = config
		this.client = new ConvexClient(config.convexUrl)
		this.opencodeRunner = new OpencodeRunner("http://localhost:4097")
	}

	async connect(): Promise<void> {
		console.log(`[convex] Connecting to Convex: ${this.config.convexUrl}`)

		try {
			// Register this container in the pool
			await this.client.mutation(api.containerPool.register, {
				containerId: this.config.containerId,
				hostname: this.config.hostname,
				capabilities: this.config.capabilities || ["opencode", "exec"],
				maxConcurrent: 1,
			})

			console.log(`[convex] Container registered: ${this.config.containerId}`)
			this.connected = true
			this.emit("connected")

			// Start heartbeat
			this.startHeartbeat()

			// Subscribe to commands assigned to this container
			this.subscribeToCommands()

			// Auth tokens handled by OpenCode server configuration
		} catch (error) {
			console.error("[convex] Failed to connect:", error)
			this.emit(
				"error",
				error instanceof Error ? error : new Error(String(error)),
			)
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

				case "abortExecution":
					result = await this.handleAbortExecution(command)
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
			console.error(
				`[convex] Command failed: ${command.type} (${commandId}):`,
				message,
			)

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

	private async handleStartExecution(
		command: ContainerCommand,
	): Promise<unknown> {
		const payload = command.payload as {
			message: string
			model?: string
			provider?: string
			providerId?: string
			modelId?: string
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
		let opencodeSessionId: string | undefined

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
				providerId: payload.providerId || payload.provider,
				modelId: payload.modelId || payload.model,
				status: "running",
				startedAt: Date.now(),
			})
			console.log(`[convex] Created agent session: ${correlationId}`)
		} catch (error) {
			console.error(`[convex] Failed to create agent session:`, error)
		}

		let errorMessage: string | undefined

		// Stream execution results to Convex
		const providerId = payload.providerId || payload.provider
		const modelId = payload.modelId || payload.model
		if (!providerId || !modelId) {
			throw new Error("providerId and modelId are required for OpenCode")
		}

		for await (const event of this.opencodeRunner.executeStream({
			prompt: payload.message,
			providerId,
			modelId,
			systemPrompt: payload.systemPrompt,
			sessionId: payload.sessionId,
		})) {
			// Handle error events from process manager
			if (event.type === "error") {
				errorMessage = event.error || "OpenCode session failed"
				console.error(`[convex] Process error: ${errorMessage}`)

				// Store error as an agent message
				await this.client.mutation(api.agentMessages.create, {
					sessionId: correlationId,
					content: JSON.stringify({
						type: "error",
						error: errorMessage,
					}),
					sequenceNumber: sequenceNumber++,
				})
				continue
			}

			// Store each message in Convex
			if (event.type === "data" && event.data) {
				const data = event.data as {
					type?: string
					properties?: Record<string, unknown>
					messageResult?: {
						info?: { id?: string }
						parts?: Array<{ id?: string; type?: string; text?: string }>
					}
				}
				const messageId =
					data.messageResult?.info?.id ||
					(data.properties?.messageID as string | undefined)
				const partId = data.properties?.partID as string | undefined
				await this.client.mutation(api.agentMessages.create, {
					sessionId: correlationId,
					messageId,
					partId,
					content: JSON.stringify(data),
					sequenceNumber: sequenceNumber++,
				})

				if (event.sessionId) {
					opencodeSessionId = event.sessionId
				}

				if (data.type === "message.response" && data.messageResult?.parts) {
					for (const part of data.messageResult.parts) {
						if (part.type === "text" && part.text) {
							accumulatedTextParts.push(part.text)
						}
					}
				}
			}
		}

		// Determine the best response text
		// Prefer the explicit result, fall back to accumulated text
		const responseText = finalResult || accumulatedTextParts.join("")

		// If we have an error, send it as an error chat message
		if (taskId && errorMessage) {
			const formattedError = formatApiError(errorMessage)
			try {
				await this.client.mutation(api.chat.sendTaskMessage, {
					taskId: taskId as Id<"tasks">,
					text: formattedError,
					sender: "ai",
					model: payload.model || payload.modelId,
					provider: payload.provider || payload.providerId,
					sessionId: opencodeSessionId,
					isError: true,
				})
				console.log(`[convex] Error message added to chat for task ${taskId}`)
			} catch (error) {
				console.error(`[convex] Failed to add error chat message:`, error)
			}
		}
		// If we have a task and any response, insert it as an AI chat message
		else if (taskId && responseText) {
			try {
				await this.client.mutation(api.chat.sendTaskMessage, {
					taskId: taskId as Id<"tasks">,
					text: responseText,
					sender: "ai",
					model: payload.model || payload.modelId,
					provider: payload.provider || payload.providerId,
					sessionId: opencodeSessionId,
				})
				console.log(`[convex] AI response added to chat for task ${taskId}`)
			} catch (error) {
				console.error(`[convex] Failed to add AI chat message:`, error)
			}
		}

		// Update the task's active session for resumption
		if (taskId && opencodeSessionId) {
			try {
				await this.client.mutation(api.tasks.setActiveSession, {
					taskId: taskId as Id<"tasks">,
					sessionId: opencodeSessionId,
					containerId: this.config.containerId,
				})
				console.log(`[convex] Task session updated: ${opencodeSessionId}`)
			} catch (error) {
				console.error(`[convex] Failed to update task session:`, error)
			}
		}

		// Update the agent session status
		const finalStatus = errorMessage ? "failed" : "completed"
		try {
			await this.client.mutation(api.agentSessions.updateStatus, {
				sessionId: correlationId,
				status: finalStatus,
				result: errorMessage || responseText || undefined,
				completedAt: Date.now(),
				opencodeSessionId: opencodeSessionId,
				providerId: payload.providerId || payload.provider,
				modelId: payload.modelId || payload.model,
			})
		} catch (error) {
			console.error(`[convex] Failed to update agent session status:`, error)
		}

		if (opencodeSessionId) {
			try {
				const diffs = await this.opencodeRunner.getDiff(opencodeSessionId)
				await this.client.mutation(api.opencodeDiffs.record, {
					sessionId: opencodeSessionId,
					diffs,
				})
			} catch (error) {
				console.error(`[convex] Failed to record session diff:`, error)
			}
		}

		return { correlationId, opencodeSessionId, status: finalStatus }
	}

	private async handleStartPhaseExecution(
		command: ContainerCommand,
	): Promise<unknown> {
		const payload = command.payload as {
			taskId: string
			phase: string
			customPrompt?: string
			configOverrides?: {
				model?: string
				providerId?: string
				modelId?: string
				permissionMode?: string
			}
		}

		// Get phase configuration from Convex
		const phaseConfig = await this.client.query(api.taskPhases.getPhase, {
			taskId: payload.taskId as Id<"tasks">,
			phase: payload.phase as
				| "requirements"
				| "planning"
				| "implementation"
				| "ai_review"
				| "remediation"
				| "human_review"
				| "merge",
		})

		if (!phaseConfig) {
			throw new Error(
				`Phase ${payload.phase} not found for task ${payload.taskId}`,
			)
		}

		const prompt =
			payload.customPrompt ||
			phaseConfig.prompt ||
			`Execute ${payload.phase} phase`
		const model = payload.configOverrides?.model || phaseConfig.model
		const providerId =
			payload.configOverrides?.providerId || phaseConfig.providerId
		const modelId = payload.configOverrides?.modelId || phaseConfig.modelId

		// Execute the phase
		return await this.handleStartExecution({
			...command,
			payload: {
				message: prompt,
				model,
				providerId,
				modelId,
				permissionMode: payload.configOverrides?.permissionMode,
				taskId: payload.taskId,
			},
		})
	}

	private async handleAbortExecution(
		command: ContainerCommand,
	): Promise<unknown> {
		const payload = command.payload as {
			correlationId?: string
			processId?: number
			sessionId?: string
		}

		if (payload.sessionId) {
			await this.opencodeRunner.abort(payload.sessionId)
			return { success: true }
		}

		return { success: false, error: "sessionId required" }
	}

	getState(): { connected: boolean; containerId: string } {
		return {
			connected: this.connected,
			containerId: this.config.containerId,
		}
	}
}
