/**
 * Container API Server
 *
 * Connects to Convex to receive commands from the gateway and execute them.
 * Commands include: startExecution, abortExecution, startOAuthFlow, etc.
 *
 * CONVEX_URL is required - the container cannot operate without it.
 */

import { Elysia } from "elysia"
import { AuthManager } from "./auth-manager"
import { ConvexIntegration } from "./convex-integration"
import { ProcessManager } from "./process-manager"
import type { HealthStatus } from "./types"

const PORT = parseInt(process.env.PORT || "4096", 10)
const CONVEX_URL = process.env.CONVEX_URL
const CONTAINER_ID =
	process.env.CONTAINER_ID || process.env.TS_HOSTNAME || "unknown"
const HOSTNAME = process.env.TS_HOSTNAME || "localhost"
const startTime = Date.now()

// Validate required environment variables
if (!CONVEX_URL) {
	console.error("[api] FATAL: CONVEX_URL environment variable is required")
	console.error("[api] The container cannot receive commands without Convex")
	process.exit(1)
}

if (CONTAINER_ID === "unknown") {
	console.error("[api] FATAL: CONTAINER_ID or TS_HOSTNAME environment variable is required")
	console.error("[api] The container must have a unique identifier to register in the pool")
	process.exit(1)
}

// Initialize managers
const authManager = new AuthManager()
const processManager = new ProcessManager()

// Convex integration (connects to Convex for commands)
let convexIntegration: ConvexIntegration

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

// Minimal HTTP server for health checks only
// Used by entrypoint.sh to verify the server started
const app = new Elysia()
	.get("/health", async (): Promise<HealthStatus> => {
		const activeProcesses = processManager.getActiveProcesses()
		const convexState = convexIntegration?.getState()
		return {
			status: convexState?.connected ? "ok" : "degraded",
			activeProcesses: activeProcesses.count,
			version: "1.0.0",
			uptime: Date.now() - startTime,
			convexConnected: convexState?.connected ?? false,
		}
	})

// ==========================================================================
// Start Server
// ==========================================================================
app.listen(PORT, async () => {
	console.log(`[api] Container API server running on port ${PORT}`)
	console.log(`[api] Container ID: ${CONTAINER_ID}`)
	console.log(`[api] Hostname: ${HOSTNAME}`)
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
		console.error("[api] FATAL: Failed to connect to Convex:", error)
		process.exit(1)
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
export { app, authManager, processManager }

// Export app type for Eden Treaty type inference
export type ContainerApp = typeof app
