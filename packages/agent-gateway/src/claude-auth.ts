/**
 * Claude Authentication Setup
 *
 * Handles OAuth authentication by delegating to containers.
 * The resulting token is stored in Convex and pushed to containers.
 *
 * Uses Convex real-time subscriptions for OAuth flows where:
 * 1. Frontend creates a pending OAuth flow in Convex
 * 2. Gateway subscribes and reacts instantly to new flows
 * 3. Gateway creates a containerCommand for OAuth start on specific container
 * 4. Container processes command, runs `claude setup-token`, returns URL
 * 5. Gateway watches for command completion, updates OAuth flow
 * 6. Frontend shows URL to user
 * 7. User submits auth code via frontend
 * 8. Gateway creates another containerCommand for OAuth complete
 * 9. Container completes OAuth and stores token in Convex secrets
 * 10. Gateway marks OAuth flow as completed
 */

import { EventEmitter } from "node:events"
import { api } from "@agent-manager/convex/api"
import type { Id } from "@agent-manager/convex/dataModel"
import { ConvexClient } from "convex/browser"

// Types for Convex OAuth flows
interface ConvexOAuthFlow {
	_id: string
	provider: string
	status:
		| "pending"
		| "started"
		| "code_received"
		| "completing"
		| "completed"
		| "failed"
	oauthUrl?: string
	flowId?: string
	expiresAt?: number
	authCode?: string
	error?: string
	createdAt: number
	updatedAt: number
}

// Container pool entry type
interface ContainerPoolEntry {
	_id: string
	containerId: string
	hostname: string
	status: "idle" | "busy" | "reserved" | "offline"
	capabilities?: string[]
}

export interface OAuthFlowResult {
	success: boolean
	token?: string
	error?: string
}

// Track active OAuth flows delegated to containers
interface ActiveContainerOAuthFlow {
	convexFlowId: string
	containerId: string
	containerFlowId?: string
	commandId?: string
	startedAt: number
}

/**
 * Claude authentication manager for the gateway.
 * Delegates OAuth to containers via containerCommands (Convex-driven).
 */
export class ClaudeAuth extends EventEmitter {
	private convexUrl: string
	private convexClient: ConvexClient | null = null
	private subscriptionsActive = false

	// Track flows being processed to avoid duplicate handling
	private processingFlows: Set<string> = new Set()

	// Track container flows: convexFlowId -> ActiveContainerOAuthFlow
	private containerFlowMap: Map<string, ActiveContainerOAuthFlow> = new Map()

	constructor(convexUrl: string) {
		super()
		this.convexUrl = convexUrl
	}

	/**
	 * Get the stored token from Convex
	 */
	async getStoredToken(): Promise<string | null> {
		if (!this.convexUrl) return null

		try {
			const response = await fetch(`${this.convexUrl}/api/query`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					path: "secrets:get",
					args: { key: "ANTHROPIC_AUTH_TOKEN" },
				}),
			})

			if (!response.ok) return null

			const result = await response.json()
			return result.value?.value || null
		} catch (error) {
			console.error("[claude-auth] Failed to get stored token:", error)
			return null
		}
	}

	/**
	 * Store the token in Convex
	 */
	async storeToken(token: string): Promise<boolean> {
		if (!this.convexUrl) {
			console.error("[claude-auth] Cannot store token: CONVEX_URL not set")
			return false
		}

		try {
			const response = await fetch(`${this.convexUrl}/api/mutation`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					path: "secrets:set",
					args: {
						key: "ANTHROPIC_AUTH_TOKEN",
						value: token,
						description: "Claude OAuth token for container authentication",
					},
				}),
			})

			if (!response.ok) {
				const text = await response.text()
				console.error("[claude-auth] Failed to store token:", text)
				return false
			}

			console.log("[claude-auth] Token stored successfully in Convex")
			return true
		} catch (error) {
			console.error("[claude-auth] Failed to store token:", error)
			return false
		}
	}

	/**
	 * Check if we have a valid stored token
	 */
	async hasValidToken(): Promise<boolean> {
		const token = await this.getStoredToken()
		return !!token && token.length > 20
	}

	/**
	 * Request a management container via Convex command queue
	 * The gateway's command processor will handle the actual creation
	 */
	private async requestManagementContainer(): Promise<{
		status: "exists" | "requested" | "pending"
		containerId?: string
		error?: string
	}> {
		if (!this.convexClient) {
			return { status: "pending", error: "Convex client not initialized" }
		}

		try {
			const result = await this.convexClient.mutation(
				api.aiProviders.requestManagementContainer,
				{},
			)
			return {
				status: result.status,
				containerId: result.containerId,
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error)
			return { status: "pending", error: msg }
		}
	}

	/**
	 * Find an available container from the containerPool
	 */
	private async findAvailableContainer(): Promise<ContainerPoolEntry | null> {
		if (!this.convexClient) return null

		try {
			const containers = await this.convexClient.query(
				api.containerPool.getAvailable,
				{},
			)
			return (containers?.[0] as ContainerPoolEntry | undefined) ?? null
		} catch (error) {
			console.error("[claude-auth] Failed to query containerPool:", error)
			return null
		}
	}

	/**
	 * Cleanup all flows on shutdown
	 */
	cleanup(): void {
		this.containerFlowMap.clear()
		this.stopConvexSubscriptions()
	}

	// ==========================================================================
	// Convex Real-time Subscriptions for OAuth Flows
	// ==========================================================================

	/**
	 * Start Convex subscriptions for OAuth flow requests.
	 * Uses real-time WebSocket sync instead of polling.
	 */
	startConvexSubscriptions(): void {
		if (this.subscriptionsActive) {
			console.log("[claude-auth] Convex subscriptions already active")
			return
		}

		if (!this.convexUrl) {
			console.error("[claude-auth] Cannot start subscriptions: no Convex URL")
			return
		}

		console.log("[claude-auth] Starting Convex real-time subscriptions")
		this.convexClient = new ConvexClient(this.convexUrl)
		this.subscriptionsActive = true

		// Subscribe to pending OAuth flows - reacts instantly when frontend creates one
		this.convexClient.onUpdate(
			api.aiProviders.getPendingOAuthFlows,
			{},
			(pendingFlows) => {
				this.handlePendingFlows(pendingFlows ?? [])
			},
		)

		// Subscribe to flows with submitted auth codes - reacts instantly when user submits code
		this.convexClient.onUpdate(
			api.aiProviders.getOAuthFlowsWithCodes,
			{},
			(flowsWithCodes) => {
				this.handleFlowsWithCodes(flowsWithCodes ?? [])
			},
		)

		console.log("[claude-auth] Convex subscriptions active")
	}

	/**
	 * Stop Convex subscriptions
	 */
	stopConvexSubscriptions(): void {
		if (this.convexClient) {
			this.convexClient.close()
			this.convexClient = null
		}
		this.subscriptionsActive = false
		console.log("[claude-auth] Stopped Convex subscriptions")
	}

	/**
	 * Handle pending OAuth flows from subscription
	 */
	private handlePendingFlows(pendingFlows: ConvexOAuthFlow[]): void {
		for (const flow of pendingFlows) {
			// Skip if we're already processing this flow
			if (this.processingFlows.has(flow._id)) continue

			// Mark as processing to avoid duplicate handling
			this.processingFlows.add(flow._id)

			console.log(
				`[claude-auth] Processing pending OAuth flow: ${flow._id} (provider: ${flow.provider})`,
			)

			// Process asynchronously
			this.processPendingFlow(flow).finally(() => {
				this.processingFlows.delete(flow._id)
			})
		}
	}

	/**
	 * Process a single pending OAuth flow by delegating to a container via containerCommands
	 */
	private async processPendingFlow(flow: ConvexOAuthFlow): Promise<void> {
		if (!this.convexClient) {
			console.error("[claude-auth] Convex client not initialized")
			await this.updateConvexFlowFailure(flow._id, "Gateway not properly configured")
			return
		}

		// Find an available container from containerPool
		let container = await this.findAvailableContainer()

		if (!container) {
			console.log("[claude-auth] No available containers in pool, requesting management container...")

			// Request a management container via Convex mutation
			try {
				const result = await this.requestManagementContainer()
				if (result.error) {
					console.error(`[claude-auth] Failed to request container: ${result.error}`)
					await this.updateConvexFlowFailure(flow._id, result.error)
					return
				}

				if (result.status === "exists" && result.containerId) {
					console.log(`[claude-auth] Management container already exists: ${result.containerId}`)
				} else {
					console.log(`[claude-auth] Container creation requested (status: ${result.status})`)
				}

				// Wait for a container to appear in the pool (poll for up to 120 seconds)
				// Container creation via SSH and Convex registration takes time
				console.log("[claude-auth] Waiting for container to register in pool...")
				for (let i = 0; i < 120; i++) {
					await new Promise(resolve => setTimeout(resolve, 1000))
					container = await this.findAvailableContainer()
					if (container) {
						console.log(`[claude-auth] Container available: ${container.containerId}`)
						break
					}
					// Log progress every 10 seconds
					if (i > 0 && i % 10 === 0) {
						console.log(`[claude-auth] Still waiting for container... (${i}s)`)
					}
				}

				if (!container) {
					console.error("[claude-auth] Container did not register within timeout")
					await this.updateConvexFlowFailure(flow._id, "Container did not register in time")
					return
				}
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error)
				console.error(`[claude-auth] Failed to request container: ${msg}`)
				await this.updateConvexFlowFailure(flow._id, `Failed to create container: ${msg}`)
				return
			}
		}

		const containerId = container.containerId
		console.log(`[claude-auth] Delegating OAuth to container: ${containerId}`)

		// Track this flow
		this.containerFlowMap.set(flow._id, {
			convexFlowId: flow._id,
			containerId,
			startedAt: Date.now(),
		})

		try {
			// Create a gatewayCommand to start OAuth flow on the container
			const commandId = await this.convexClient.mutation(
				api.containerCommands.startOAuthFlow,
				{
					containerId,
					provider: flow.provider,
					oauthFlowId: flow._id,
				},
			)

			console.log(`[claude-auth] Created startOAuthFlow command: ${commandId}`)

			// Update our tracking with the command ID
			const activeFlow = this.containerFlowMap.get(flow._id)
			if (activeFlow) {
				activeFlow.commandId = commandId as unknown as string
			}

			// Wait for the command to complete (poll for result)
			let attempts = 0
			const maxAttempts = 120 // 2 minutes
			while (attempts < maxAttempts) {
				await new Promise(resolve => setTimeout(resolve, 1000))
				attempts++

				const command = await this.convexClient.query(
					api.containerCommands.get,
					{ id: commandId },
				)

				if (!command) {
					console.error("[claude-auth] Command not found")
					break
				}

				if (command.status === "completed") {
					const result = command.result as {
						success: boolean
						flowId?: string
						url?: string
						expiresIn?: number
						error?: string
					}

					if (result.success && result.url && result.flowId) {
						// Update the flow with the OAuth URL
						const activeFlow = this.containerFlowMap.get(flow._id)
						if (activeFlow) {
							activeFlow.containerFlowId = result.flowId
						}

						await this.updateConvexFlowStarted(
							flow._id,
							result.url,
							result.flowId,
							Date.now() + (result.expiresIn ?? 600) * 1000,
						)
						console.log(`[claude-auth] OAuth URL received: ${result.url}`)
						return
					} else {
						console.error(`[claude-auth] OAuth flow start failed: ${result.error}`)
						await this.updateConvexFlowFailure(flow._id, result.error ?? "Unknown error")
						this.containerFlowMap.delete(flow._id)
						return
					}
				} else if (command.status === "failed") {
					console.error(`[claude-auth] Command failed: ${command.error}`)
					await this.updateConvexFlowFailure(flow._id, command.error ?? "Command failed")
					this.containerFlowMap.delete(flow._id)
					return
				}

				// Log progress every 10 seconds
				if (attempts > 0 && attempts % 10 === 0) {
					console.log(`[claude-auth] Waiting for OAuth URL... (${attempts}s)`)
				}
			}

			// Timeout
			console.error("[claude-auth] Timeout waiting for OAuth URL")
			await this.updateConvexFlowFailure(flow._id, "Timeout waiting for OAuth URL")
			this.containerFlowMap.delete(flow._id)

		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error)
			console.error(`[claude-auth] Failed to start OAuth flow: ${msg}`)
			await this.updateConvexFlowFailure(flow._id, msg)
			this.containerFlowMap.delete(flow._id)
		}
	}

	/**
	 * Handle flows with submitted auth codes from subscription
	 */
	private handleFlowsWithCodes(flowsWithCodes: ConvexOAuthFlow[]): void {
		for (const flow of flowsWithCodes) {
			if (!flow.authCode || !flow.flowId) continue

			// Skip if already processing
			if (this.processingFlows.has(flow._id)) continue

			// Mark as processing
			this.processingFlows.add(flow._id)

			console.log(
				`[claude-auth] Completing OAuth flow ${flow._id} with auth code`,
			)

			// Process asynchronously
			this.processFlowWithCode(flow).finally(() => {
				this.processingFlows.delete(flow._id)
			})
		}
	}

	/**
	 * Process a flow that has an auth code submitted
	 */
	private async processFlowWithCode(flow: ConvexOAuthFlow): Promise<void> {
		if (!this.convexClient) {
			console.error("[claude-auth] Convex client not initialized")
			await this.updateConvexFlowFailure(flow._id, "Gateway not properly configured")
			return
		}

		// Find the container handling this flow
		const activeFlow = this.containerFlowMap.get(flow._id)

		if (!activeFlow || !activeFlow.containerFlowId) {
			console.error(`[claude-auth] No active container flow for: ${flow._id}`)
			await this.updateConvexFlowFailure(flow._id, "OAuth session expired")
			return
		}

		// Mark as completing in Convex
		await this.updateConvexFlowCompleting(flow._id)

		try {
			// Create a containerCommand to complete the OAuth flow
			const commandId = await this.convexClient.mutation(
				api.containerCommands.completeOAuthFlow,
				{
					containerId: activeFlow.containerId,
					oauthFlowId: flow._id,
					containerFlowId: activeFlow.containerFlowId,
					authCode: flow.authCode!,
				},
			)

			console.log(`[claude-auth] Created completeOAuthFlow command: ${commandId}`)

			// Wait for the command to complete (poll for result)
			let attempts = 0
			const maxAttempts = 180 // 3 minutes (OAuth completion can take time)
			while (attempts < maxAttempts) {
				await new Promise(resolve => setTimeout(resolve, 1000))
				attempts++

				const command = await this.convexClient.query(
					api.containerCommands.get,
					{ id: commandId },
				)

				if (!command) {
					console.error("[claude-auth] Command not found")
					break
				}

				if (command.status === "completed") {
					const result = command.result as {
						success: boolean
						hasToken?: boolean
						error?: string
					}

					if (result.success && result.hasToken) {
						// Token was stored in Convex secrets by the container
						await this.updateConvexFlowSuccess(flow._id)
						console.log(`[claude-auth] OAuth flow completed successfully`)

						// Emit event for any listeners
						this.emit("auth:token-acquired", {})

						// Cleanup
						this.containerFlowMap.delete(flow._id)
						return
					} else {
						console.error(`[claude-auth] OAuth flow completion failed: ${result.error}`)
						await this.updateConvexFlowFailure(flow._id, result.error ?? "Unknown error")
						this.containerFlowMap.delete(flow._id)
						return
					}
				} else if (command.status === "failed") {
					console.error(`[claude-auth] Command failed: ${command.error}`)
					await this.updateConvexFlowFailure(flow._id, command.error ?? "Command failed")
					this.containerFlowMap.delete(flow._id)
					return
				}

				// Log progress every 15 seconds
				if (attempts > 0 && attempts % 15 === 0) {
					console.log(`[claude-auth] Waiting for OAuth completion... (${attempts}s)`)
				}
			}

			// Timeout
			console.error("[claude-auth] Timeout waiting for OAuth completion")
			await this.updateConvexFlowFailure(flow._id, "Timeout waiting for OAuth completion")
			this.containerFlowMap.delete(flow._id)

		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error)
			console.error(`[claude-auth] Failed to complete OAuth flow: ${msg}`)
			await this.updateConvexFlowFailure(flow._id, msg)
			this.containerFlowMap.delete(flow._id)
		}
	}

	/**
	 * Update Convex flow to started status with OAuth URL
	 */
	private async updateConvexFlowStarted(
		flowId: string,
		oauthUrl: string,
		gatewayFlowId: string,
		expiresAt: number,
	): Promise<void> {
		if (!this.convexClient) return
		try {
			await this.convexClient.mutation(api.aiProviders.updateOAuthFlowStarted, {
				flowId: flowId as never,
				oauthUrl,
				gatewayFlowId,
				expiresAt,
			})
			console.log(`[claude-auth] Updated Convex flow ${flowId} to started`)
		} catch (error) {
			console.error(`[claude-auth] Failed to update flow to started:`, error)
		}
	}

	/**
	 * Update Convex flow to completing status
	 */
	private async updateConvexFlowCompleting(flowId: string): Promise<void> {
		if (!this.convexClient) return
		try {
			await this.convexClient.mutation(
				api.aiProviders.updateOAuthFlowCompleting,
				{
					flowId: flowId as never,
				},
			)
		} catch (error) {
			console.error(
				`[claude-auth] Failed to update flow to completing:`,
				error,
			)
		}
	}

	/**
	 * Update Convex flow to completed status
	 */
	private async updateConvexFlowSuccess(flowId: string): Promise<void> {
		if (!this.convexClient) return
		try {
			await this.convexClient.mutation(api.aiProviders.completeOAuthFlowSuccess, {
				flowId: flowId as never,
			})
			console.log(`[claude-auth] OAuth flow ${flowId} completed successfully`)
		} catch (error) {
			console.error(`[claude-auth] Failed to update flow to success:`, error)
		}
	}

	/**
	 * Update Convex flow to failed status
	 */
	private async updateConvexFlowFailure(
		flowId: string,
		error: string,
	): Promise<void> {
		if (!this.convexClient) return
		try {
			await this.convexClient.mutation(api.aiProviders.completeOAuthFlowFailure, {
				flowId: flowId as never,
				error,
			})
			console.log(`[claude-auth] OAuth flow ${flowId} failed: ${error}`)
		} catch (error) {
			console.error(`[claude-auth] Failed to update flow to failure:`, error)
		}
	}
}
