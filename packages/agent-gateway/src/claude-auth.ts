/**
 * Claude Authentication Setup
 *
 * Handles OAuth authentication by delegating to containers.
 * The resulting token is stored in Convex and pushed to containers.
 *
 * Uses Convex real-time subscriptions for OAuth flows where:
 * 1. Frontend creates a pending OAuth flow in Convex
 * 2. Gateway subscribes and reacts instantly to new flows
 * 3. Gateway delegates OAuth to a container via WebSocket
 * 4. Container runs `claude setup-token` and returns the URL
 * 5. Gateway updates Convex with OAuth URL
 * 6. Frontend shows URL to user
 * 7. User submits auth code via frontend
 * 8. Gateway delegates code completion to container
 * 9. Container completes OAuth and returns token
 * 10. Gateway stores token in Convex
 */

import { EventEmitter } from "node:events"
import { api } from "@agent-manager/convex/api"
import { ConvexClient } from "convex/browser"
import type { ConnectionManager } from "./connections"

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
	startedAt: number
}

/**
 * Claude authentication manager for the gateway.
 * Delegates OAuth to containers which run `claude setup-token`.
 */
export class ClaudeAuth extends EventEmitter {
	private convexUrl: string
	private convexClient: ConvexClient | null = null
	private subscriptionsActive = false
	private connections: ConnectionManager | null = null

	// Track flows being processed to avoid duplicate handling
	private processingFlows: Set<string> = new Set()

	// Track container flows: containerFlowId -> convexFlowId
	private containerFlowMap: Map<string, ActiveContainerOAuthFlow> = new Map()

	constructor(convexUrl: string) {
		super()
		this.convexUrl = convexUrl
	}

	/**
	 * Set the connection manager for sending messages to containers
	 */
	setConnectionManager(connections: ConnectionManager): void {
		this.connections = connections
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
	 * Ensure a management container exists by calling Convex action
	 */
	private async ensureManagementContainer(): Promise<{
		containerId?: string
		hostname?: string
		error?: string
	}> {
		if (!this.convexClient) {
			return { error: "Convex client not initialized" }
		}

		try {
			const result = await this.convexClient.action(
				api.aiProviders.ensureManagementContainer,
				{},
			)
			return {
				containerId: result.containerId,
				hostname: result.hostname,
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error)
			return { error: msg }
		}
	}

	/**
	 * Handle OAuth URL response from container
	 */
	handleContainerAuthFlowUrl(
		containerId: string,
		payload: { flowId: string; url: string; expiresIn: number },
	): void {
		console.log(
			`[claude-auth] Received auth:flow:url from container ${containerId}`,
		)

		// Find the Convex flow associated with this container flow
		const activeFlow = this.containerFlowMap.get(payload.flowId)
		if (!activeFlow) {
			console.warn(
				`[claude-auth] No active flow found for container flowId: ${payload.flowId}`,
			)
			return
		}

		// Store the container's flow ID
		activeFlow.containerFlowId = payload.flowId

		// Update Convex with the OAuth URL
		this.updateConvexFlowStarted(
			activeFlow.convexFlowId,
			payload.url,
			payload.flowId,
			Date.now() + payload.expiresIn * 1000,
		)
	}

	/**
	 * Handle auth status change from container (used after OAuth completion)
	 */
	handleContainerAuthStatus(
		containerId: string,
		payload: { authenticated: boolean; method?: string },
	): void {
		console.log(
			`[claude-auth] Auth status from ${containerId}: authenticated=${payload.authenticated}`,
		)

		// If a container just became authenticated after an OAuth flow,
		// we should request the token from it
		// For now, we rely on the container sending the token back
	}

	/**
	 * Handle error from container during auth flow
	 */
	handleContainerError(
		containerId: string,
		payload: { code: string; message: string },
		correlationId?: string,
	): void {
		if (payload.code !== "AUTH_FLOW_FAILED") return

		console.error(
			`[claude-auth] Auth flow error from ${containerId}: ${payload.message}`,
		)

		// Find the Convex flow for this container
		for (const [flowId, activeFlow] of this.containerFlowMap.entries()) {
			if (activeFlow.containerId === containerId) {
				this.updateConvexFlowFailure(activeFlow.convexFlowId, payload.message)
				this.containerFlowMap.delete(flowId)
				break
			}
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
	 * Process a single pending OAuth flow by delegating to a container
	 */
	private async processPendingFlow(flow: ConvexOAuthFlow): Promise<void> {
		if (!this.connections) {
			console.error("[claude-auth] No connection manager set")
			await this.updateConvexFlowFailure(
				flow._id,
				"Gateway not properly configured",
			)
			return
		}

		// Find an available container, or ensure one exists
		let container = this.connections.findAvailableContainer()

		if (!container) {
			console.log("[claude-auth] No connected containers, ensuring management container exists...")

			// Call Convex action to ensure a management container exists
			try {
				const result = await this.ensureManagementContainer()
				if (result.error) {
					console.error(`[claude-auth] Failed to ensure container: ${result.error}`)
					await this.updateConvexFlowFailure(flow._id, result.error)
					return
				}

				// Wait for the container to connect (poll for up to 60 seconds)
				console.log(`[claude-auth] Waiting for container ${result.containerId} to connect...`)
				for (let i = 0; i < 60; i++) {
					await new Promise(resolve => setTimeout(resolve, 1000))
					container = this.connections.findAvailableContainer()
					if (container) {
						console.log(`[claude-auth] Container connected: ${container.info.containerId}`)
						break
					}
				}

				if (!container) {
					console.error("[claude-auth] Container did not connect within timeout")
					await this.updateConvexFlowFailure(flow._id, "Container did not connect in time")
					return
				}
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error)
				console.error(`[claude-auth] Failed to ensure container: ${msg}`)
				await this.updateConvexFlowFailure(flow._id, `Failed to create container: ${msg}`)
				return
			}
		}

		const containerId = container.info.containerId
		console.log(`[claude-auth] Delegating OAuth to container: ${containerId}`)

		// Generate a correlation ID for tracking
		const correlationId = crypto.randomUUID()

		// Track this flow
		this.containerFlowMap.set(correlationId, {
			convexFlowId: flow._id,
			containerId,
			startedAt: Date.now(),
		})

		// Send auth:flow:start to container
		const sent = this.connections.sendToContainer(
			containerId,
			"auth:flow:start",
			{},
			correlationId,
		)

		if (!sent) {
			console.error(
				`[claude-auth] Failed to send auth:flow:start to ${containerId}`,
			)
			this.containerFlowMap.delete(correlationId)
			await this.updateConvexFlowFailure(
				flow._id,
				"Failed to communicate with container",
			)
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
		if (!this.connections) {
			console.error("[claude-auth] No connection manager set")
			await this.updateConvexFlowFailure(
				flow._id,
				"Gateway not properly configured",
			)
			return
		}

		// Find the container handling this flow
		let activeFlow: ActiveContainerOAuthFlow | undefined
		for (const [_, af] of this.containerFlowMap) {
			if (af.convexFlowId === flow._id) {
				activeFlow = af
				break
			}
		}

		if (!activeFlow || !activeFlow.containerFlowId) {
			console.error(`[claude-auth] No active container flow for: ${flow._id}`)
			await this.updateConvexFlowFailure(flow._id, "OAuth session expired")
			return
		}

		// Mark as completing in Convex
		await this.updateConvexFlowCompleting(flow._id)

		// Send auth:flow:complete to container
		const sent = this.connections.sendToContainer(
			activeFlow.containerId,
			"auth:flow:complete",
			{
				flowId: activeFlow.containerFlowId,
				code: flow.authCode,
			},
		)

		if (!sent) {
			console.error(
				`[claude-auth] Failed to send auth:flow:complete to ${activeFlow.containerId}`,
			)
			await this.updateConvexFlowFailure(
				flow._id,
				"Failed to communicate with container",
			)
		}

		// The container will complete the flow and we'll get an auth:status update
		// We need to listen for that in the gateway's message handler
	}

	/**
	 * Called when container reports successful OAuth completion with token
	 */
	async handleOAuthSuccess(containerId: string, token: string): Promise<void> {
		// Find the Convex flow for this container
		for (const [flowId, activeFlow] of this.containerFlowMap) {
			if (activeFlow.containerId === containerId) {
				// Store the token
				await this.storeToken(token)

				// Update Convex
				await this.updateConvexFlowSuccess(activeFlow.convexFlowId)

				// Emit event for gateway to push token to all containers
				this.emit("auth:token-acquired", { token })

				// Cleanup
				this.containerFlowMap.delete(flowId)
				return
			}
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
