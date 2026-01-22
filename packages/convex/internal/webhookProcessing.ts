import { v } from "convex/values"
import { api, internal } from "../_generated/api"
import { internalAction } from "../_generated/server"

// Process GitHub webhook
export const processGithubWebhook = internalAction({
	args: { eventId: v.id("webhookEvents") },
	handler: async (ctx, args) => {
		// Mark as processing
		await ctx.runMutation(api.webhooks.markProcessing, { id: args.eventId })

		try {
			const event = await ctx.runQuery(api.webhooks.get, { id: args.eventId })
			if (!event) throw new Error("Webhook event not found")

			const payload = event.payload as {
				action?: string
				pull_request?: {
					number: number
					title: string
					state: string
					merged?: boolean
				}
				repository?: {
					full_name: string
				}
				check_run?: {
					name: string
					status: string
					conclusion: string
				}
			}

			// Handle different GitHub event types
			switch (event.eventType) {
				case "pull_request":
					// Handle PR events (opened, closed, merged, etc.)
					console.log(
						`Processing PR event: ${payload.action} for PR #${payload.pull_request?.number}`,
					)
					// In production, would update pullRequests table based on event
					break

				case "check_run":
					// Handle CI check events
					console.log(
						`Processing check run: ${payload.check_run?.name} - ${payload.check_run?.status}`,
					)
					// In production, would update prChecks table
					break

				case "push":
					// Handle push events
					console.log(`Processing push to ${payload.repository?.full_name}`)
					break

				default:
					console.log(`Unhandled GitHub event type: ${event.eventType}`)
			}

			// Mark as processed
			await ctx.runMutation(api.webhooks.markProcessed, { id: args.eventId })

			// Record history
			await ctx.runMutation(internal.internal.history.recordEvent, {
				action: `Processed GitHub webhook: ${event.eventType}`,
				user: "system",
				metadata: { eventId: args.eventId, eventType: event.eventType },
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error"
			await ctx.runMutation(api.webhooks.markFailed, {
				id: args.eventId,
				errorMessage: message,
			})
			throw error
		}
	},
})

// Process CI/CD webhook
export const processCicdWebhook = internalAction({
	args: { eventId: v.id("webhookEvents") },
	handler: async (ctx, args) => {
		await ctx.runMutation(api.webhooks.markProcessing, { id: args.eventId })

		try {
			const event = await ctx.runQuery(api.webhooks.get, { id: args.eventId })
			if (!event) throw new Error("Webhook event not found")

			const payload = event.payload as {
				buildId?: string
				status?: string
				pullRequestId?: string
				checkName?: string
				output?: string
			}

			// Handle CI/CD status updates
			console.log(
				`Processing CI/CD event: ${event.eventType} - status: ${payload.status}`,
			)

			// In production, would:
			// 1. Find the associated PR
			// 2. Update or create check record
			// 3. Update PR status if all checks pass/fail

			await ctx.runMutation(api.webhooks.markProcessed, { id: args.eventId })

			await ctx.runMutation(internal.internal.history.recordEvent, {
				action: `Processed CI/CD webhook: ${event.eventType}`,
				user: "system",
				metadata: { eventId: args.eventId },
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error"
			await ctx.runMutation(api.webhooks.markFailed, {
				id: args.eventId,
				errorMessage: message,
			})
			throw error
		}
	},
})

// Process AI agent callback
export const processAgentCallback = internalAction({
	args: { eventId: v.id("webhookEvents") },
	handler: async (ctx, args) => {
		await ctx.runMutation(api.webhooks.markProcessing, { id: args.eventId })

		try {
			const event = await ctx.runQuery(api.webhooks.get, { id: args.eventId })
			if (!event) throw new Error("Webhook event not found")

			const payload = event.payload as {
				type?: string
				jobId?: string
				taskId?: string
				result?: {
					success: boolean
					data?: unknown
					error?: string
				}
			}

			// Handle agent completion callbacks
			console.log(
				`Processing agent callback: ${payload.type} for job ${payload.jobId}`,
			)

			// In production, would:
			// 1. Find the associated job
			// 2. Update job status
			// 3. Process results (e.g., create acceptance criteria, update task)

			await ctx.runMutation(api.webhooks.markProcessed, { id: args.eventId })

			await ctx.runMutation(internal.internal.history.recordEvent, {
				action: `Processed agent callback: ${payload.type}`,
				user: "system",
				metadata: { eventId: args.eventId, jobId: payload.jobId },
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error"
			await ctx.runMutation(api.webhooks.markFailed, {
				id: args.eventId,
				errorMessage: message,
			})
			throw error
		}
	},
})

// Process Tailscale webhook
// Tailscale webhook event structure:
// - timestamp: RFC 3339 timestamp
// - version: payload version number
// - type: event type (nodeCreated, nodeDeleted, etc.)
// - tailnet: tailnet name
// - message: human-readable description
// - data: event-specific data with fields like nodeID, deviceName, actor, url
export const processTailscaleWebhook = internalAction({
	args: { eventId: v.id("webhookEvents") },
	handler: async (ctx, args) => {
		await ctx.runMutation(api.webhooks.markProcessing, { id: args.eventId })

		try {
			const event = await ctx.runQuery(api.webhooks.get, { id: args.eventId })
			if (!event) throw new Error("Webhook event not found")

			// Tailscale webhook payload structure
			const payload = event.payload as {
				timestamp?: string
				version?: number
				type?: string
				tailnet?: string
				message?: string
				data?: {
					nodeID?: string
					deviceName?: string
					managedBy?: string
					actor?: string
					url?: string
				}
			}

			const eventData = payload.data
			const nodeID = eventData?.nodeID
			const deviceName = eventData?.deviceName

			// Handle different Tailscale event types
			switch (event.eventType) {
				case "nodeCreated":
				case "nodeApproved":
					if (nodeID && deviceName) {
						// Log the event - device sync requires fetching full device details via API
						// to get tags, addresses, etc. which aren't included in webhook events
						console.log(
							`Tailscale ${event.eventType}: ${deviceName} (${nodeID})`,
						)
						// Schedule a device sync to fetch full details from Tailscale API
						await ctx.scheduler.runAfter(
							0,
							internal.internal.tailscale.syncDeviceFromApi,
							{ nodeID },
						)
					} else {
						console.log(
							`Tailscale ${event.eventType} missing nodeID or deviceName`,
						)
					}
					break

				case "nodeDeleted":
					if (nodeID) {
						// Try to remove from both servers and containers
						await ctx.runMutation(internal.internal.tailscale.removeDevice, {
							nodeId: nodeID,
							deviceType: "server",
						})
						await ctx.runMutation(internal.internal.tailscale.removeDevice, {
							nodeId: nodeID,
							deviceType: "container",
						})
						console.log(`Removed Tailscale device: ${nodeID} (${deviceName})`)
					}
					break

				case "nodeKeyExpiringInOneDay":
				case "nodeKeyExpired":
					console.log(
						`Warning: Tailscale node key ${event.eventType === "nodeKeyExpired" ? "expired" : "expiring"} for device: ${deviceName} (${nodeID})`,
					)
					break

				case "test":
					// Test webhook event sent when configuring webhooks
					console.log(`Tailscale test webhook received for tailnet: ${payload.tailnet}`)
					break

				default:
					console.log(
						`Unhandled Tailscale event type: ${event.eventType}`,
						JSON.stringify(payload, null, 2),
					)
			}

			await ctx.runMutation(api.webhooks.markProcessed, { id: args.eventId })

			await ctx.runMutation(internal.internal.history.recordEvent, {
				action: `Processed Tailscale webhook: ${event.eventType}`,
				user: "system",
				metadata: {
					eventId: args.eventId,
					eventType: event.eventType,
					nodeID,
					deviceName,
				},
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error"
			await ctx.runMutation(api.webhooks.markFailed, {
				id: args.eventId,
				errorMessage: message,
			})
			throw error
		}
	},
})

// Retry failed webhooks
export const retryFailedWebhooks = internalAction({
	args: { maxRetries: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const maxRetries = args.maxRetries ?? 3
		const failedWebhooks = await ctx.runQuery(api.webhooks.listFailed, {
			maxRetries,
		})

		let retried = 0
		for (const webhook of failedWebhooks) {
			// Reset for retry
			await ctx.runMutation(api.webhooks.resetForRetry, { id: webhook._id })

			// Schedule reprocessing based on source
			switch (webhook.source) {
				case "github":
					await ctx.scheduler.runAfter(
						0,
						internal.internal.webhookProcessing.processGithubWebhook,
						{
							eventId: webhook._id,
						},
					)
					break
				case "cicd":
					await ctx.scheduler.runAfter(
						0,
						internal.internal.webhookProcessing.processCicdWebhook,
						{
							eventId: webhook._id,
						},
					)
					break
				case "agent":
					await ctx.scheduler.runAfter(
						0,
						internal.internal.webhookProcessing.processAgentCallback,
						{
							eventId: webhook._id,
						},
					)
					break
				case "tailscale":
					await ctx.scheduler.runAfter(
						0,
						internal.internal.webhookProcessing.processTailscaleWebhook,
						{
							eventId: webhook._id,
						},
					)
					break
			}
			retried++
		}

		return { retriedCount: retried }
	},
})
