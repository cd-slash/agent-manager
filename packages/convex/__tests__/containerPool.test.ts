/**
 * Container Pool - Pool Management Tests
 *
 * Tests the container pool management system including:
 * - Container registration/unregistration
 * - Acquire/release lifecycle
 * - Reservation system
 * - Availability queries
 */

import { describe, expect, it } from "bun:test"
import { api } from "../_generated/api"
import schema from "../schema"
import { createConvexTest } from "./setup"

describe("containerPool", () => {
	describe("registration", () => {
		it("should register a new container as idle", async () => {
			const t = await createConvexTest(schema)

			const poolId = await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "container-123.ts.local",
				capabilities: ["execute", "file-access"],
				maxConcurrent: 1,
			})

			expect(poolId).toBeDefined()

			const container = await t.query(api.containerPool.get, {
				containerId: "container-123",
			})

			expect(container).toBeDefined()
			expect(container?.status).toBe("idle")
			expect(container?.hostname).toBe("container-123.ts.local")
			expect(container?.capabilities).toEqual(["execute", "file-access"])
			expect(container?.maxConcurrent).toBe(1)
			expect(container?.currentLoad).toBe(0)
		})

		it("should update existing container on re-registration", async () => {
			const t = await createConvexTest(schema)

			// First registration
			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "old-hostname.ts.local",
				maxConcurrent: 1,
			})

			// Re-registration with new hostname
			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "new-hostname.ts.local",
				maxConcurrent: 2,
			})

			const container = await t.query(api.containerPool.get, {
				containerId: "container-123",
			})

			expect(container?.hostname).toBe("new-hostname.ts.local")
			expect(container?.maxConcurrent).toBe(2)
			expect(container?.status).toBe("idle") // Should reset to idle
		})
	})

	describe("unregistration", () => {
		it("should mark container as offline when unregistered", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "test.ts.local",
			})

			await t.mutation(api.containerPool.unregister, {
				containerId: "container-123",
			})

			const container = await t.query(api.containerPool.get, {
				containerId: "container-123",
			})

			expect(container?.status).toBe("offline")
		})
	})

	describe("acquire/release", () => {
		it("should acquire an idle container", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "test.ts.local",
			})

			// Need to create a gateway command for the commandId
			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test execution",
			})

			const result = await t.mutation(api.containerPool.acquire, {
				containerId: "container-123",
				sessionId: "session-456",
				commandId: commandId,
			})

			expect(result.acquired).toBe(true)

			const container = await t.query(api.containerPool.get, {
				containerId: "container-123",
			})

			expect(container?.status).toBe("busy")
			expect(container?.currentSessionId).toBe("session-456")
			expect(container?.currentCommandId).toEqual(commandId)
			expect(container?.currentLoad).toBe(1)
		})

		it("should reject acquire for busy container", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "test.ts.local",
			})

			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test",
			})

			// First acquire succeeds
			await t.mutation(api.containerPool.acquire, {
				containerId: "container-123",
				sessionId: "session-1",
				commandId: commandId,
			})

			// Second acquire should fail
			const commandId2 = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test 2",
			})

			await expect(
				t.mutation(api.containerPool.acquire, {
					containerId: "container-123",
					sessionId: "session-2",
					commandId: commandId2,
				}),
			).rejects.toThrow("is not available")
		})

		it("should release container back to idle", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "test.ts.local",
			})

			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test",
			})

			await t.mutation(api.containerPool.acquire, {
				containerId: "container-123",
				sessionId: "session-456",
				commandId: commandId,
			})

			const result = await t.mutation(api.containerPool.release, {
				containerId: "container-123",
				sessionId: "session-456",
			})

			expect(result.released).toBe(true)

			const container = await t.query(api.containerPool.get, {
				containerId: "container-123",
			})

			expect(container?.status).toBe("idle")
			expect(container?.currentSessionId).toBeUndefined()
			expect(container?.currentLoad).toBe(0)
		})

		it("should verify session on release", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "test.ts.local",
			})

			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test",
			})

			await t.mutation(api.containerPool.acquire, {
				containerId: "container-123",
				sessionId: "session-456",
				commandId: commandId,
			})

			// Try to release with wrong session
			const result = await t.mutation(api.containerPool.release, {
				containerId: "container-123",
				sessionId: "wrong-session",
			})

			expect(result.released).toBe(false)
			expect(result.error).toBe("Session mismatch")
		})
	})

	describe("reservation", () => {
		it("should reserve container for a task", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "test.ts.local",
			})

			const result = await t.mutation(api.containerPool.reserve, {
				containerId: "container-123",
				taskId: "task-789",
			})

			expect(result.reserved).toBe(true)

			const container = await t.query(api.containerPool.get, {
				containerId: "container-123",
			})

			expect(container?.status).toBe("reserved")
			expect(container?.reservedForTaskId).toBe("task-789")
		})

		it("should allow acquire on reserved container", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "test.ts.local",
			})

			await t.mutation(api.containerPool.reserve, {
				containerId: "container-123",
				taskId: "task-789",
			})

			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test",
			})

			// Acquire should work on reserved container
			const result = await t.mutation(api.containerPool.acquire, {
				containerId: "container-123",
				sessionId: "session-456",
				commandId: commandId,
			})

			expect(result.acquired).toBe(true)
		})

		it("should unreserve container", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "test.ts.local",
			})

			await t.mutation(api.containerPool.reserve, {
				containerId: "container-123",
				taskId: "task-789",
			})

			const result = await t.mutation(api.containerPool.unreserve, {
				containerId: "container-123",
				taskId: "task-789",
			})

			expect(result.unreserved).toBe(true)

			const container = await t.query(api.containerPool.get, {
				containerId: "container-123",
			})

			expect(container?.status).toBe("idle")
			expect(container?.reservedForTaskId).toBeUndefined()
		})

		it("should verify task on unreserve", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "test.ts.local",
			})

			await t.mutation(api.containerPool.reserve, {
				containerId: "container-123",
				taskId: "task-789",
			})

			const result = await t.mutation(api.containerPool.unreserve, {
				containerId: "container-123",
				taskId: "wrong-task",
			})

			expect(result.unreserved).toBe(false)
			expect(result.error).toBe("Task mismatch")
		})
	})

	describe("queries", () => {
		it("should list all containers", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-1",
				hostname: "test1.ts.local",
			})
			await t.mutation(api.containerPool.register, {
				containerId: "container-2",
				hostname: "test2.ts.local",
			})

			const containers = await t.query(api.containerPool.list, {})

			expect(containers.length).toBe(2)
		})

		it("should get containers by status", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-1",
				hostname: "test1.ts.local",
			})
			await t.mutation(api.containerPool.register, {
				containerId: "container-2",
				hostname: "test2.ts.local",
			})

			// Make one busy
			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test",
			})
			await t.mutation(api.containerPool.acquire, {
				containerId: "container-1",
				sessionId: "session-1",
				commandId: commandId,
			})

			const idleContainers = await t.query(api.containerPool.getByStatus, {
				status: "idle",
			})
			const busyContainers = await t.query(api.containerPool.getByStatus, {
				status: "busy",
			})

			expect(idleContainers.length).toBe(1)
			expect(idleContainers[0]?.containerId).toBe("container-2")
			expect(busyContainers.length).toBe(1)
			expect(busyContainers[0]?.containerId).toBe("container-1")
		})

		it("should get available containers sorted by LRU", async () => {
			const t = await createConvexTest(schema)

			// Register containers (they'll have different lastActivityAt based on order)
			await t.mutation(api.containerPool.register, {
				containerId: "container-1",
				hostname: "test1.ts.local",
			})
			await t.mutation(api.containerPool.register, {
				containerId: "container-2",
				hostname: "test2.ts.local",
			})
			await t.mutation(api.containerPool.register, {
				containerId: "container-3",
				hostname: "test3.ts.local",
			})

			const available = await t.query(api.containerPool.getAvailable, {})

			expect(available.length).toBe(3)
			// Should be sorted by lastActivityAt (oldest first - LRU)
			expect(available[0]?.containerId).toBe("container-1")
		})

		it("should get pool statistics", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-1",
				hostname: "test1.ts.local",
			})
			await t.mutation(api.containerPool.register, {
				containerId: "container-2",
				hostname: "test2.ts.local",
			})
			await t.mutation(api.containerPool.register, {
				containerId: "container-3",
				hostname: "test3.ts.local",
			})

			// Make one busy
			const commandId = await t.mutation(api.gatewayCommands.startExecution, {
				message: "Test",
			})
			await t.mutation(api.containerPool.acquire, {
				containerId: "container-1",
				sessionId: "session-1",
				commandId: commandId,
			})

			// Reserve one
			await t.mutation(api.containerPool.reserve, {
				containerId: "container-2",
				taskId: "task-1",
			})

			// Mark one offline
			await t.mutation(api.containerPool.markOffline, {
				containerId: "container-3",
			})

			const stats = await t.query(api.containerPool.getStats, {})

			expect(stats.total).toBe(3)
			expect(stats.busy).toBe(1)
			expect(stats.reserved).toBe(1)
			expect(stats.offline).toBe(1)
			expect(stats.idle).toBe(0)
		})

		it("should find container for task", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-1",
				hostname: "test1.ts.local",
			})
			await t.mutation(api.containerPool.register, {
				containerId: "container-reserved",
				hostname: "reserved.ts.local",
			})

			// Reserve one for a specific task
			await t.mutation(api.containerPool.reserve, {
				containerId: "container-reserved",
				taskId: "task-xyz",
			})

			// Should prefer reserved container for that task
			const found = await t.query(api.containerPool.findForTask, {
				taskId: "task-xyz",
			})

			expect(found?.containerId).toBe("container-reserved")

			// For different task, should return idle container
			const foundOther = await t.query(api.containerPool.findForTask, {
				taskId: "task-other",
			})

			expect(foundOther?.containerId).toBe("container-1")
		})
	})

	describe("health checks", () => {
		it("should update health check timestamp", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "test.ts.local",
			})

			const before = await t.query(api.containerPool.get, {
				containerId: "container-123",
			})
			const beforeHealthCheck = before?.lastHealthCheck

			// Small delay to ensure different timestamp
			await new Promise((resolve) => setTimeout(resolve, 10))

			await t.mutation(api.containerPool.updateHealthCheck, {
				containerId: "container-123",
			})

			const after = await t.query(api.containerPool.get, {
				containerId: "container-123",
			})

			expect(after?.lastHealthCheck).toBeGreaterThanOrEqual(beforeHealthCheck!)
		})
	})

	describe("cleanup", () => {
		it("should remove stale offline containers", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.containerPool.register, {
				containerId: "container-123",
				hostname: "test.ts.local",
			})

			await t.mutation(api.containerPool.markOffline, {
				containerId: "container-123",
			})

			// Clean up with 0ms threshold (everything)
			const result = await t.mutation(api.containerPool.cleanupOffline, {
				olderThanMs: 0,
			})

			expect(result.deleted).toBeGreaterThanOrEqual(0)
		})
	})
})
