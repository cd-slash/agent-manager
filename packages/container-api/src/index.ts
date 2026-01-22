/**
 * Container API Server
 *
 * HTTP server that wraps the Claude CLI for remote orchestration.
 * Provides REST endpoints and SSE streaming for task execution.
 *
 * This server runs inside each container and is accessed by the manager app
 * via Tailscale networking (proxied on port 80 via tailscale serve).
 *
 * Connects to Convex directly to receive commands and stream results.
 */

import { Elysia } from "elysia"
import { AuthManager } from "./auth-manager"
import { ConvexIntegration } from "./convex-integration"
import { ProcessManager } from "./process-manager"
import { SessionManager } from "./session-manager"
import type { HealthStatus, MessageOptions, ModelInfo } from "./types"

const PORT = parseInt(process.env.PORT || "4096", 10)
const CONVEX_URL = process.env.CONVEX_URL // e.g., https://brazen-skunk-217.convex.cloud
const CONTAINER_ID =
	process.env.CONTAINER_ID || process.env.TS_HOSTNAME || "unknown"
const HOSTNAME = process.env.TS_HOSTNAME || "localhost"
const startTime = Date.now()

// Initialize managers
const authManager = new AuthManager()
const processManager = new ProcessManager()
const sessionManager = new SessionManager()

// Convex integration (connects to Convex for commands and streaming)
let convexIntegration: ConvexIntegration | null = null

// Start watching for auth changes
authManager.startWatching().catch(console.error)

// Log events from managers
authManager.on("auth:changed", (data) => {
	console.log("[api] Auth status changed:", data)
})

processManager.on("process:started", (data) => {
	console.log("[api] Process started:", data.processId)
})

processManager.on("process:completed", (data) => {
	console.log("[api] Process completed:", data.processId)
})

processManager.on("process:error", (data) => {
	console.log("[api] Process error:", data.processId, data.error)
})

// Create the API server
const app = new Elysia()
	// ==========================================================================
	// Health Check
	// ==========================================================================
	.get("/health", async (): Promise<HealthStatus> => {
		const activeProcesses = processManager.getActiveProcesses()
		return {
			status: "ok",
			activeProcesses: activeProcesses.count,
			version: "1.0.0",
			uptime: Date.now() - startTime,
		}
	})

	// ==========================================================================
	// Authentication Endpoints
	// ==========================================================================
	.get("/auth/anthropic", async () => {
		return await authManager.getStatus()
	})

	.post("/auth/anthropic/oauth", async ({ body }) => {
		const { token } = body as { token: string }

		if (!token) {
			return new Response(JSON.stringify({ error: "Token is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		try {
			await authManager.setToken(token)
			return { success: true }
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			return new Response(JSON.stringify({ error: message }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			})
		}
	})

	.delete("/auth/anthropic/oauth", async () => {
		try {
			await authManager.removeToken()
			return { success: true }
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			return new Response(JSON.stringify({ error: message }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			})
		}
	})

	.post("/auth/anthropic/oauth/start", async () => {
		try {
			const result = await authManager.startOAuthFlow()
			return result
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			return new Response(JSON.stringify({ error: message }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			})
		}
	})

	.post("/auth/anthropic/oauth/complete", async ({ body }) => {
		const { flowId, code } = body as { flowId: string; code: string }

		if (!flowId || !code) {
			return new Response(
				JSON.stringify({ error: "flowId and code are required" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			)
		}

		try {
			const result = await authManager.completeOAuthFlow(flowId, code)
			return result
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			return new Response(JSON.stringify({ error: message }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			})
		}
	})

	// ==========================================================================
	// Message Endpoints
	// ==========================================================================
	.post("/messages/", async ({ body, set }) => {
		const options = body as MessageOptions & { stream?: boolean }

		if (!options.message) {
			set.status = 400
			return { error: "Message is required" }
		}

		// Streaming mode
		if (options.stream !== false) {
			// Return SSE stream
			const stream = new ReadableStream({
				async start(controller) {
					const encoder = new TextEncoder()

					const sendEvent = (event: string, data: unknown) => {
						controller.enqueue(encoder.encode(`event: ${event}\n`))
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
						)
					}

					try {
						for await (const event of processManager.executeStream(options)) {
							switch (event.type) {
								case "start":
									sendEvent("start", { processId: event.processId })
									break
								case "data":
									sendEvent("data", event.data)
									break
								case "error":
									sendEvent("error", {
										exitCode: event.exitCode,
										stderr: event.error,
									})
									break
								case "done":
									sendEvent("done", {})
									break
							}
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error)
						sendEvent("error", { error: message })
					} finally {
						controller.close()
					}
				},
			})

			return new Response(stream, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				},
			})
		}

		// Sync mode
		try {
			const result = await processManager.execute(options)
			return result
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			set.status = 500
			return { error: message }
		}
	})

	.get("/messages/active", () => {
		return processManager.getActiveProcesses()
	})

	.post("/messages/:processId/abort", ({ params, set }) => {
		const processId = parseInt(params.processId, 10)

		if (Number.isNaN(processId)) {
			set.status = 400
			return { error: "Invalid process ID" }
		}

		const success = processManager.abort(processId)

		if (!success) {
			set.status = 404
			return { error: "Process not found" }
		}

		return { success: true }
	})

	// ==========================================================================
	// Session Endpoints
	// ==========================================================================
	.get("/sessions/", async () => {
		const sessions = await sessionManager.listSessions()
		return { sessions }
	})

	.get("/sessions/:sessionId", async ({ params, set }) => {
		const session = await sessionManager.getSession(params.sessionId)

		if (!session) {
			set.status = 404
			return { error: "Session not found" }
		}

		return { session }
	})

	.get("/sessions/:sessionId/messages", async ({ params, set }) => {
		const session = await sessionManager.getSession(params.sessionId)

		if (!session) {
			set.status = 404
			return { error: "Session not found" }
		}

		const messages = await sessionManager.getSessionMessages(params.sessionId)
		return { messages }
	})

	.delete("/sessions/:sessionId", async ({ params, set }) => {
		const success = await sessionManager.deleteSession(params.sessionId)

		if (!success) {
			set.status = 404
			return { error: "Session not found" }
		}

		return { success: true }
	})

	// ==========================================================================
	// Convex Connection Status
	// ==========================================================================
	.get("/convex/status", () => {
		const state = convexIntegration?.getState()
		return {
			connected: state?.connected || false,
			containerId: state?.containerId || CONTAINER_ID,
			convexUrl: CONVEX_URL || null,
		}
	})

	// ==========================================================================
	// Model Endpoints
	// ==========================================================================
	.get("/models", (): ModelInfo[] => {
		// Return available Claude models
		return [
			{
				id: "claude-sonnet-4-20250514",
				name: "Claude Sonnet 4",
				provider: "anthropic",
			},
			{
				id: "claude-opus-4-20250514",
				name: "Claude Opus 4",
				provider: "anthropic",
			},
			{
				id: "claude-3-5-haiku-20241022",
				name: "Claude 3.5 Haiku",
				provider: "anthropic",
			},
		]
	})

// ==========================================================================
// Start Server
// ==========================================================================
app.listen(PORT, async () => {
	console.log(`[api] Container API server running on port ${PORT}`)
	console.log(`[api] Container ID: ${CONTAINER_ID}`)
	console.log(`[api] Hostname: ${HOSTNAME}`)
	console.log(`[api] Health check: http://localhost:${PORT}/health`)

	// Connect to Convex if configured
	if (CONVEX_URL) {
		console.log(`[api] Connecting to Convex: ${CONVEX_URL}`)
		convexIntegration = new ConvexIntegration(
			{
				convexUrl: CONVEX_URL,
				containerId: CONTAINER_ID,
				hostname: HOSTNAME,
			},
			authManager,
			processManager,
		)

		try {
			await convexIntegration.connect()
			console.log("[api] Connected to Convex - ready to receive commands")
		} catch (error) {
			console.error("[api] Failed to connect to Convex:", error)
			// Continue running - REST API still works for local testing
		}
	} else {
		console.log("[api] CONVEX_URL not set, running in REST-only mode")
		console.log("[api] Set CONVEX_URL to enable Convex integration")
	}
})

// Graceful shutdown
process.on("SIGTERM", async () => {
	console.log("[api] Received SIGTERM, shutting down...")
	processManager.abortAll()
	await convexIntegration?.disconnect()
	await authManager.stopWatching()
	process.exit(0)
})

process.on("SIGINT", async () => {
	console.log("[api] Received SIGINT, shutting down...")
	processManager.abortAll()
	await convexIntegration?.disconnect()
	await authManager.stopWatching()
	process.exit(0)
})

// Export for testing
export { app, authManager, processManager, sessionManager }

// Export app type for Eden Treaty type inference
export type ContainerApp = typeof app
