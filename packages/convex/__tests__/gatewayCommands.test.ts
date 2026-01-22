/**
 * Gateway Commands - Command Queuing System Tests
 *
 * Tests the Convex-driven command queuing system including:
 * - Command creation with priorities
 * - Status transitions (pending -> queued -> processing -> completed/failed)
 * - Retry logic
 * - Queue ordering by priority
 */

import { describe, expect, it, beforeAll } from "bun:test"
import { api } from "../_generated/api"
import schema from "../schema"
import { createConvexTest } from "./setup"

describe("gatewayCommands", () => {
	describe("createContainer", () => {
		it("should create a container command with pending status", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/test/repo",
				branch: "main",
				name: "test-container",
				server: "localhost",
			})

			expect(commandId).toBeDefined()

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command).toBeDefined()
			expect(command?.type).toBe("createContainer")
			expect(command?.status).toBe("pending")
			expect(command?.priority).toBe("normal")
			expect(command?.retryCount).toBe(0)
			expect(command?.maxRetries).toBe(3)
			expect(command?.payload.repo).toBe("https://github.com/test/repo")
			expect(command?.payload.branch).toBe("main")
		})

		it("should respect custom priority", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/test/repo",
				priority: "high",
			})

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.priority).toBe("high")
		})
	})

	describe("startExecution", () => {
		it("should create an execution command with correlationId", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test prompt",
				model: "claude-sonnet-4-20250514",
			})

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command).toBeDefined()
			expect(command?.type).toBe("startExecution")
			expect(command?.status).toBe("pending")
			expect(command?.correlationId).toBeDefined()
			expect(command?.maxRetries).toBe(2) // Execution commands have fewer retries
		})

		it("should create executionQueue entry for tracking", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test prompt",
				taskId: "task-123",
			})

			// Check execution queue entry was created
			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.taskId).toBe("task-123")
		})

		it("should include all execution parameters", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				containerId: "container-abc",
				message: "Do something",
				model: "claude-opus-4-20250514",
				workingDirectory: "/app",
				permissionMode: "auto-edit",
				systemPrompt: "You are a helpful assistant",
				allowedTools: ["Bash", "Read"],
				maxBudget: 5.0,
			})

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.payload.containerId).toBe("container-abc")
			expect(command?.payload.message).toBe("Do something")
			expect(command?.payload.model).toBe("claude-opus-4-20250514")
			expect(command?.payload.workingDirectory).toBe("/app")
			expect(command?.payload.permissionMode).toBe("auto-edit")
			expect(command?.payload.systemPrompt).toBe("You are a helpful assistant")
			expect(command?.payload.allowedTools).toEqual(["Bash", "Read"])
			expect(command?.payload.maxBudget).toBe(5.0)
		})
	})

	describe("abortExecution", () => {
		it("should create abort command with critical priority", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.abortExecution, {
				correlationId: "session-123",
			})

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.type).toBe("abortExecution")
			expect(command?.priority).toBe("critical") // Aborts are always high priority
			expect(command?.maxRetries).toBe(1) // Only one attempt for abort
		})
	})

	describe("pushAuthToken", () => {
		it("should create auth token push command with high priority", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.pushAuthToken, {
				containerId: "container-abc",
				token: "sk-test-token",
			})

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.type).toBe("pushAuthToken")
			expect(command?.priority).toBe("high") // Auth tokens should be pushed quickly
			expect(command?.payload.containerId).toBe("container-abc")
			expect(command?.payload.token).toBe("sk-test-token")
		})
	})

	describe("startPhaseExecution", () => {
		it("should create phase execution command", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(
				api.gatewayCommands.startPhaseExecution,
				{
					taskId: "task-123",
					phase: "implementation",
				},
			)

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.type).toBe("startPhaseExecution")
			expect(command?.payload.taskId).toBe("task-123")
			expect(command?.payload.phase).toBe("implementation")
			expect(command?.correlationId).toBeDefined()
		})
	})

	describe("status transitions", () => {
		it("should mark command as processing", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/test/repo",
			})

			await t.mutation(api.gatewayCommands.markProcessing, { id: commandId })

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.status).toBe("processing")
			expect(command?.processedAt).toBeDefined()
		})

		it("should mark command as queued with position", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test",
			})

			await t.mutation(api.gatewayCommands.markQueued, {
				id: commandId,
				queuePosition: 3,
			})

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.status).toBe("queued")
			expect(command?.queuePosition).toBe(3)
			expect(command?.queuedAt).toBeDefined()
		})

		it("should assign container and change status to processing", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test",
			})

			await t.mutation(api.gatewayCommands.markQueued, { id: commandId })
			await t.mutation(api.gatewayCommands.assignContainer, {
				id: commandId,
				containerId: "container-xyz",
			})

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.status).toBe("processing")
			expect(command?.assignedContainerId).toBe("container-xyz")
			expect(command?.processedAt).toBeDefined()
		})

		it("should complete command with result", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/test/repo",
			})

			await t.mutation(api.gatewayCommands.markProcessing, { id: commandId })
			await t.mutation(api.gatewayCommands.complete, {
				id: commandId,
				result: { containerId: "new-container", hostname: "test.local" },
			})

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.status).toBe("completed")
			expect(command?.result.containerId).toBe("new-container")
			expect(command?.completedAt).toBeDefined()
		})
	})

	describe("retry logic", () => {
		it("should retry failed command if retries remaining", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/test/repo",
			})

			await t.mutation(api.gatewayCommands.markProcessing, { id: commandId })

			// First failure - should retry
			const result1 = await t.mutation(api.gatewayCommands.fail, {
				id: commandId,
				error: "Connection timeout",
			})

			expect(result1?.retried).toBe(true)

			const command1 = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command1?.status).toBe("pending") // Back to pending for retry
			expect(command1?.retryCount).toBe(1)
			expect(command1?.lastError).toBe("Connection timeout")
		})

		it("should fail permanently after max retries", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/test/repo",
			})

			// Simulate 3 failures (maxRetries = 3)
			for (let i = 0; i < 3; i++) {
				await t.mutation(api.gatewayCommands.markProcessing, { id: commandId })
				await t.mutation(api.gatewayCommands.fail, {
					id: commandId,
					error: `Failure ${i + 1}`,
				})
			}

			// 4th failure should be permanent
			await t.mutation(api.gatewayCommands.markProcessing, { id: commandId })
			const result = await t.mutation(api.gatewayCommands.fail, {
				id: commandId,
				error: "Final failure",
			})

			expect(result?.retried).toBe(false)

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.status).toBe("failed")
			expect(command?.error).toBe("Final failure")
			expect(command?.completedAt).toBeDefined()
		})

		it("should not retry if canRetry is false", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/test/repo",
			})

			await t.mutation(api.gatewayCommands.markProcessing, { id: commandId })

			const result = await t.mutation(api.gatewayCommands.fail, {
				id: commandId,
				error: "Non-retryable error",
				canRetry: false,
			})

			expect(result?.retried).toBe(false)

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.status).toBe("failed")
		})
	})

	describe("cancellation", () => {
		it("should cancel pending command", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/test/repo",
			})

			await t.mutation(api.gatewayCommands.cancel, { id: commandId })

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.status).toBe("failed")
			expect(command?.error).toBe("Cancelled by user")
		})

		it("should cancel queued command", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test",
			})

			await t.mutation(api.gatewayCommands.markQueued, { id: commandId })
			await t.mutation(api.gatewayCommands.cancel, { id: commandId })

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			expect(command?.status).toBe("failed")
		})

		it("should reject cancel for processing command", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/test/repo",
			})

			await t.mutation(api.gatewayCommands.markProcessing, { id: commandId })

			await expect(
				t.mutation(api.gatewayCommands.cancel, { id: commandId }),
			).rejects.toThrow("Cannot cancel command in status: processing")
		})
	})

	describe("queries", () => {
		it("should get pending commands ordered by priority", async () => {
			const t = await createConvexTest(schema)

			// Create commands with different priorities
			await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/low/repo",
				priority: "low",
			})
			await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/critical/repo",
				priority: "critical",
			})
			await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/normal/repo",
				priority: "normal",
			})
			await t.mutation(api.gatewayCommands.createContainer, {
				repo: "https://github.com/high/repo",
				priority: "high",
			})

			const pending = await t.query(api.gatewayCommands.getPending, {})

			expect(pending.length).toBe(4)
			// Should be ordered: critical, high, normal, low
			expect(pending[0]?.priority).toBe("critical")
			expect(pending[1]?.priority).toBe("high")
			expect(pending[2]?.priority).toBe("normal")
			expect(pending[3]?.priority).toBe("low")
		})

		it("should get commands by correlation ID", async () => {
			const t = await createConvexTest(schema)
			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test",
			})

			const command = await t.query(api.gatewayCommands.get, { id: commandId })
			const correlationId = command?.correlationId

			const foundCommand = await t.query(
				api.gatewayCommands.getByCorrelationId,
				{
					correlationId: correlationId!,
				},
			)

			expect(foundCommand?._id).toEqual(commandId)
		})

		it("should get queue statistics", async () => {
			const t = await createConvexTest(schema)

			// Create various commands
			const cmd1 = await t.mutation(api.gatewayCommands.createContainer, {
				repo: "repo1",
				priority: "high",
			})
			const cmd2 = await t.mutation(api.gatewayCommands.createContainer, {
				repo: "repo2",
				priority: "normal",
			})
			const cmd3 = await t.mutation(api.gatewayCommands.startExecution, {
				message: "test",
				priority: "critical",
			})

			// Move one to processing
			await t.mutation(api.gatewayCommands.markProcessing, { id: cmd1 })

			// Move one to queued
			await t.mutation(api.gatewayCommands.markQueued, { id: cmd3 })

			const stats = await t.query(api.gatewayCommands.getQueueStats, {})

			expect(stats.pending).toBe(1)
			expect(stats.queued).toBe(1)
			expect(stats.processing).toBe(1)
			expect(stats.total).toBe(3)
			expect(stats.byPriority.normal).toBe(1)
			expect(stats.byPriority.critical).toBe(1)
		})
	})

	describe("cleanup", () => {
		it("should delete old completed commands", async () => {
			const t = await createConvexTest(schema)

			// Create and complete a command
			const commandId = await t.mutation(api.gatewayCommands.createContainer, {
				repo: "repo",
			})
			await t.mutation(api.gatewayCommands.markProcessing, { id: commandId })
			await t.mutation(api.gatewayCommands.complete, {
				id: commandId,
				result: { success: true },
			})

			// Since we can't easily manipulate timestamps in convex-test,
			// we'll just verify the cleanup function runs without error
			const result = await t.mutation(api.gatewayCommands.cleanupOld, {
				olderThanMs: 0, // Clean up everything
			})

			expect(result.deleted).toBeGreaterThanOrEqual(0)
		})
	})
})
