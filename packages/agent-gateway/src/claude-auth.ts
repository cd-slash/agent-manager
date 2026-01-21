/**
 * Claude Authentication Setup
 *
 * Handles one-time `claude setup-token` authentication via PTY.
 * The resulting token is stored in Convex and pushed to containers.
 */

import { EventEmitter } from "node:events"

interface BunSubprocess {
	terminal?: {
		write(data: string): void
		close(): void
	}
	kill(): void
	exited: Promise<number>
}

interface OAuthFlowOutput {
	allOutput: string
	foundToken: string
	codeWasSent: boolean
}

export interface OAuthFlowResult {
	success: boolean
	token?: string
	error?: string
}

export interface OAuthFlowState {
	flowId: string
	url: string
	expiresAt: number
	process?: BunSubprocess
	outputState?: OAuthFlowOutput
}

/**
 * Claude authentication manager for the gateway.
 * Runs `claude setup-token` via PTY to obtain OAuth tokens.
 */
export class ClaudeAuth extends EventEmitter {
	private activeFlows: Map<string, OAuthFlowState> = new Map()
	private convexUrl: string

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
	 * Start OAuth flow using `claude setup-token`
	 * Returns a URL for the user to visit and a flowId to complete the flow.
	 */
	async startOAuthFlow(): Promise<{
		flowId: string
		url: string
		expiresIn: number
	}> {
		const flowId = crypto.randomUUID()
		const expiresIn = 600 // 10 minutes

		console.log(`[claude-auth] Starting OAuth flow: ${flowId}`)

		// Shared state to track output
		const outputState: OAuthFlowOutput = {
			allOutput: "",
			foundToken: "",
			codeWasSent: false,
		}

		let urlResolve: ((url: string) => void) | null = null
		let foundUrl = ""

		// Use Bun.spawn with terminal option for PTY
		const proc = Bun.spawn(["claude", "setup-token"], {
			terminal: {
				cols: 120,
				rows: 40,
				data(_terminal, data) {
					const chunk = data.toString()
					outputState.allOutput += chunk

					// Clean ANSI codes for logging
					const cleanChunk = chunk
						.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
						.replace(/\x1b\]0;[^\x07]*\x07/g, "")
						.replace(/[\r\n]+/g, " ")
						.trim()

					if (cleanChunk) {
						console.log(`[claude-auth] PTY: ${cleanChunk.substring(0, 200)}`)
					}

					// Look for OAuth URL
					const urlMatch = chunk.match(
						/https:\/\/claude\.ai\/oauth\/authorize[^\s\x1b\]]+/,
					)
					if (urlMatch && !foundUrl) {
						foundUrl = urlMatch[0].replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim()
						console.log(`[claude-auth] Found OAuth URL: ${foundUrl}`)
						if (urlResolve) {
							urlResolve(foundUrl)
							urlResolve = null
						}
					}

					// Look for token in output
					const tokenPatterns = [
						/sk-ant-[a-zA-Z0-9_-]{20,}/g,
						/sk-ant-oat01-[a-zA-Z0-9_-]+/g,
					]

					for (const pattern of tokenPatterns) {
						const matches = chunk.match(pattern)
						if (matches && !outputState.foundToken) {
							const token = matches[0]
								.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
								.trim()
							if (token.length > 20) {
								outputState.foundToken = token
								console.log(
									`[claude-auth] Token found: ${token.substring(0, 20)}...`,
								)
							}
						}
					}
				},
			},
			env: process.env,
		}) as BunSubprocess

		// Wait for URL with timeout
		const url = await new Promise<string>((resolve, reject) => {
			urlResolve = resolve

			if (foundUrl) {
				resolve(foundUrl)
				return
			}

			const timeout = setTimeout(() => {
				proc.kill()
				reject(
					new Error(
						`Timeout waiting for OAuth URL. Output: ${outputState.allOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")}`,
					),
				)
			}, 60000)

			proc.exited.then((exitCode) => {
				clearTimeout(timeout)
				if (!foundUrl) {
					reject(
						new Error(
							`Process exited (code ${exitCode}) without URL. Output: ${outputState.allOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")}`,
						),
					)
				}
			})
		})

		// Store flow state
		this.activeFlows.set(flowId, {
			flowId,
			url,
			expiresAt: Date.now() + expiresIn * 1000,
			process: proc,
			outputState,
		})

		console.log(`[claude-auth] OAuth flow started: ${flowId}, URL: ${url}`)
		return { flowId, url, expiresIn }
	}

	/**
	 * Complete OAuth flow with authorization code
	 */
	async completeOAuthFlow(flowId: string, code: string): Promise<OAuthFlowResult> {
		const flow = this.activeFlows.get(flowId)
		if (!flow) {
			return { success: false, error: `OAuth flow not found: ${flowId}` }
		}

		if (Date.now() > flow.expiresAt) {
			this.activeFlows.delete(flowId)
			return { success: false, error: "OAuth flow expired" }
		}

		console.log(`[claude-auth] Completing OAuth flow: ${flowId}`)

		const proc = flow.process
		const outputState = flow.outputState

		if (!proc || !proc.terminal || !outputState) {
			this.activeFlows.delete(flowId)
			return { success: false, error: "OAuth flow process not available" }
		}

		try {
			// Extract just the authorization code
			const codeOnly = (code.split("#")[0] ?? code).trim()

			console.log(
				`[claude-auth] Sending authorization code (${codeOnly.length} chars)`,
			)

			// Small delay for TUI to be ready
			await Bun.sleep(500)

			// Send the code followed by Enter
			proc.terminal.write(`${codeOnly}\r`)
			outputState.codeWasSent = true

			console.log(`[claude-auth] Code sent, waiting for token...`)

			// Helper to extract token from output
			const extractToken = (): string | null => {
				if (outputState.foundToken) return outputState.foundToken

				const cleanOutput = outputState.allOutput.replace(
					/\x1b\[[0-9;]*[a-zA-Z]/g,
					"",
				)
				const patterns = [
					/sk-ant-[a-zA-Z0-9_-]{20,}/,
					/sk-ant-oat01-[a-zA-Z0-9_-]+/,
				]

				for (const pattern of patterns) {
					const match = cleanOutput.match(pattern)
					if (match && match[0].length > 20) {
						return match[0]
					}
				}
				return null
			}

			// Poll for token
			const pollForToken = async (): Promise<string | null> => {
				for (let i = 0; i < 120; i++) {
					await Bun.sleep(500)
					const token = extractToken()
					if (token) {
						console.log(
							`[claude-auth] Token found: ${token.substring(0, 20)}...`,
						)
						return token
					}
				}
				return null
			}

			// Race between polling and process exit
			const result = await Promise.race([
				pollForToken().then((token) => ({ type: "token" as const, token })),
				proc.exited.then((exitCode) => ({
					type: "exit" as const,
					exitCode,
				})),
				new Promise<{ type: "timeout" }>((resolve) =>
					setTimeout(() => resolve({ type: "timeout" }), 120000),
				),
			])

			let foundToken = ""

			if (result.type === "token" && result.token) {
				foundToken = result.token
			} else {
				// Final check
				const token = extractToken()
				if (token) {
					foundToken = token
				}
			}

			// Cleanup
			try {
				proc.kill()
			} catch {}
			this.activeFlows.delete(flowId)

			if (foundToken) {
				// Store the token in Convex
				await this.storeToken(foundToken)

				this.emit("auth:token-acquired", { token: foundToken })
				console.log(`[claude-auth] OAuth flow completed successfully`)
				return { success: true, token: foundToken }
			}

			// Log output for debugging
			const cleanOutput = outputState.allOutput
				.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
				.replace(/\x1b\]0;[^\x07]*\x07/g, "")
			console.log(
				`[claude-auth] No token found. Output (${cleanOutput.length} chars):`,
				cleanOutput.substring(0, 2000),
			)

			return { success: false, error: "OAuth flow failed - no token obtained" }
		} catch (error) {
			this.activeFlows.delete(flowId)
			const message = error instanceof Error ? error.message : String(error)
			console.error(`[claude-auth] OAuth completion failed: ${message}`)
			return { success: false, error: message }
		}
	}

	/**
	 * Cleanup expired flows
	 */
	cleanupExpiredFlows(): void {
		const now = Date.now()
		for (const [flowId, flow] of this.activeFlows) {
			if (now > flow.expiresAt) {
				if (flow.process) {
					try {
						flow.process.kill()
					} catch {}
				}
				this.activeFlows.delete(flowId)
				console.log(`[claude-auth] Cleaned up expired flow: ${flowId}`)
			}
		}
	}

	/**
	 * Cleanup all flows on shutdown
	 */
	cleanup(): void {
		for (const [flowId, flow] of this.activeFlows) {
			if (flow.process) {
				try {
					flow.process.kill()
				} catch {}
			}
			console.log(`[claude-auth] Cleaned up flow on shutdown: ${flowId}`)
		}
		this.activeFlows.clear()
	}
}
