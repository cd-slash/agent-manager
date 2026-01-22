/**
 * Task Phases - Phase Transition Tests
 *
 * Tests the task phase management system including:
 * - Phase initialization from templates
 * - Phase status transitions (pending -> in_progress -> completed/failed/skipped)
 * - Phase configuration and session tracking
 * - Reset and retry operations
 */

import { describe, expect, it } from "bun:test"
import { api, internal } from "../_generated/api"
import schema from "../schema"
import { createConvexTest } from "./setup"

describe("taskPhases", () => {
	// Helper to create a project and task (without triggering auto-initialize scheduler)
	async function createProjectAndTask(t: Awaited<ReturnType<typeof createConvexTest>>) {
		const projectId = await t.mutation(api.projects.create, {
			name: "Test Project",
			description: "Test Description",
		})

		// Insert task directly to avoid scheduler triggering initializePhases
		const taskId = await t.run(async (ctx) => {
			return await ctx.db.insert("tasks", {
				projectId,
				title: "Test Task",
				description: "Test task description",
				category: "backlog",
				tag: "feature",
				complexity: "medium",
				order: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
		})

		// Manually initialize phases
		await t.mutation(internal.taskPhases.initializePhases, { taskId })

		return { projectId, taskId }
	}

	describe("initializePhases", () => {
		it("should initialize default phases for a new task", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			const phases = await t.query(api.taskPhases.listByTask, { taskId })

			// Default phases: requirements, planning, implementation, ai_review, remediation, human_review, merge
			expect(phases.length).toBeGreaterThan(0)
			expect(phases[0]?.status).toBe("in_progress") // First phase starts in_progress
			expect(phases[0]?.phase).toBe("requirements")

			// Other phases should be pending
			for (let i = 1; i < phases.length; i++) {
				expect(phases[i]?.status).toBe("pending")
			}
		})

		it("should set task currentPhase to first phase", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			const task = await t.query(api.tasks.get, { id: taskId })
			expect(task?.currentPhase).toBe("requirements")
		})
	})

	describe("startPhase", () => {
		it("should start a pending phase", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			// First complete the first phase
			await t.mutation(api.taskPhases.completePhase, {
				taskId,
				phase: "requirements",
			})

			// Now start the planning phase
			const phaseId = await t.mutation(api.taskPhases.startPhase, {
				taskId,
				phase: "planning",
				provider: "anthropic",
				model: "claude-sonnet-4-20250514",
				containerId: "container-123",
			})

			expect(phaseId).toBeDefined()

			const phase = await t.query(api.taskPhases.getPhase, {
				taskId,
				phase: "planning",
			})

			expect(phase?.status).toBe("in_progress")
			expect(phase?.provider).toBe("anthropic")
			expect(phase?.model).toBe("claude-sonnet-4-20250514")
			expect(phase?.containerId).toBe("container-123")
			expect(phase?.startedAt).toBeDefined()
		})

		it("should update task currentPhase when starting", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })
			await t.mutation(api.taskPhases.completePhase, {
				taskId,
				phase: "requirements",
			})
			await t.mutation(api.taskPhases.startPhase, {
				taskId,
				phase: "planning",
			})

			const task = await t.query(api.tasks.get, { id: taskId })
			expect(task?.currentPhase).toBe("planning")
		})

		it("should reject starting non-pending phase", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			// requirements is already in_progress
			await expect(
				t.mutation(api.taskPhases.startPhase, {
					taskId,
					phase: "requirements",
				}),
			).rejects.toThrow("is not in pending status")
		})
	})

	describe("completePhase", () => {
		it("should complete an in_progress phase", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			const phaseId = await t.mutation(api.taskPhases.completePhase, {
				taskId,
				phase: "requirements",
				result: "Requirements analyzed successfully",
				totalCostUsd: 0.05,
				numTurns: 3,
			})

			expect(phaseId).toBeDefined()

			const phase = await t.query(api.taskPhases.getPhase, {
				taskId,
				phase: "requirements",
			})

			expect(phase?.status).toBe("completed")
			expect(phase?.result).toBe("Requirements analyzed successfully")
			expect(phase?.totalCostUsd).toBe(0.05)
			expect(phase?.numTurns).toBe(3)
			expect(phase?.completedAt).toBeDefined()
		})

		it("should reject completing non-in_progress phase", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			// planning is pending, not in_progress
			await expect(
				t.mutation(api.taskPhases.completePhase, {
					taskId,
					phase: "planning",
				}),
			).rejects.toThrow("is not in progress")
		})
	})

	describe("failPhase", () => {
		it("should fail an in_progress phase with error", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			const phaseId = await t.mutation(api.taskPhases.failPhase, {
				taskId,
				phase: "requirements",
				error: "API rate limit exceeded",
				totalCostUsd: 0.02,
			})

			expect(phaseId).toBeDefined()

			const phase = await t.query(api.taskPhases.getPhase, {
				taskId,
				phase: "requirements",
			})

			expect(phase?.status).toBe("failed")
			expect(phase?.error).toBe("API rate limit exceeded")
			expect(phase?.completedAt).toBeDefined()
		})
	})

	describe("skipPhase", () => {
		it("should skip a pending phase", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })
			await t.mutation(api.taskPhases.completePhase, {
				taskId,
				phase: "requirements",
			})

			const phaseId = await t.mutation(api.taskPhases.skipPhase, {
				taskId,
				phase: "planning",
				reason: "Already have implementation plan",
			})

			expect(phaseId).toBeDefined()

			const phase = await t.query(api.taskPhases.getPhase, {
				taskId,
				phase: "planning",
			})

			expect(phase?.status).toBe("skipped")
			expect(phase?.result).toBe("Already have implementation plan")
		})

		it("should reject skipping non-pending phase", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			// requirements is in_progress
			await expect(
				t.mutation(api.taskPhases.skipPhase, {
					taskId,
					phase: "requirements",
				}),
			).rejects.toThrow("is not in pending status")
		})
	})

	describe("resetPhase", () => {
		it("should reset a failed phase to pending", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			// Fail the phase first
			await t.mutation(api.taskPhases.failPhase, {
				taskId,
				phase: "requirements",
				error: "Temporary error",
			})

			// Now reset it
			const phaseId = await t.mutation(api.taskPhases.resetPhase, {
				taskId,
				phase: "requirements",
			})

			expect(phaseId).toBeDefined()

			const phase = await t.query(api.taskPhases.getPhase, {
				taskId,
				phase: "requirements",
			})

			expect(phase?.status).toBe("pending")
			expect(phase?.error).toBeUndefined()
			expect(phase?.startedAt).toBeUndefined()
			expect(phase?.completedAt).toBeUndefined()
		})

		it("should reject resetting non-failed phase", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			// requirements is in_progress, not failed
			await expect(
				t.mutation(api.taskPhases.resetPhase, {
					taskId,
					phase: "requirements",
				}),
			).rejects.toThrow("is not in failed status")
		})
	})

	describe("updatePhaseSession", () => {
		it("should update phase with session info", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			await t.mutation(api.taskPhases.updatePhaseSession, {
				taskId,
				phase: "requirements",
				agentSessionId: "session-abc123",
				containerId: "container-xyz",
				totalCostUsd: 0.10,
				numTurns: 5,
			})

			const phase = await t.query(api.taskPhases.getPhase, {
				taskId,
				phase: "requirements",
			})

			expect(phase?.agentSessionId).toBe("session-abc123")
			expect(phase?.containerId).toBe("container-xyz")
			expect(phase?.totalCostUsd).toBe(0.10)
			expect(phase?.numTurns).toBe(5)
		})

		it("should update task activeContainerId", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			await t.mutation(api.taskPhases.updatePhaseSession, {
				taskId,
				phase: "requirements",
				containerId: "container-xyz",
			})

			const task = await t.query(api.tasks.get, { id: taskId })
			expect(task?.activeContainerId).toBe("container-xyz")
		})
	})

	describe("queries", () => {
		it("should get current phase for task", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			const currentPhase = await t.query(api.taskPhases.getCurrentPhase, {
				taskId,
			})

			expect(currentPhase).toBeDefined()
			expect(currentPhase?.phase).toBe("requirements")
			expect(currentPhase?.status).toBe("in_progress")
		})

		it("should list phases by status", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			const inProgress = await t.query(api.taskPhases.listByStatus, {
				status: "in_progress",
			})

			expect(inProgress.length).toBeGreaterThan(0)
			expect(inProgress[0]?.phase).toBe("requirements")
		})
	})

	describe("full phase workflow", () => {
		it("should move through multiple phases", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			// Complete requirements
			await t.mutation(api.taskPhases.completePhase, {
				taskId,
				phase: "requirements",
				result: "Requirements done",
			})

			// Start and complete planning
			await t.mutation(api.taskPhases.startPhase, {
				taskId,
				phase: "planning",
			})

			let task = await t.query(api.tasks.get, { id: taskId })
			expect(task?.currentPhase).toBe("planning")

			await t.mutation(api.taskPhases.completePhase, {
				taskId,
				phase: "planning",
				result: "Plan created",
			})

			// Start implementation
			await t.mutation(api.taskPhases.startPhase, {
				taskId,
				phase: "implementation",
				model: "claude-opus-4-20250514",
				permissionMode: "auto-edit",
			})

			task = await t.query(api.tasks.get, { id: taskId })
			expect(task?.currentPhase).toBe("implementation")

			const phases = await t.query(api.taskPhases.listByTask, { taskId })
			const reqPhase = phases.find((p) => p.phase === "requirements")
			const planPhase = phases.find((p) => p.phase === "planning")
			const implPhase = phases.find((p) => p.phase === "implementation")

			expect(reqPhase?.status).toBe("completed")
			expect(planPhase?.status).toBe("completed")
			expect(implPhase?.status).toBe("in_progress")
		})

		it("should handle failure and retry", async () => {
			const t = await createConvexTest(schema)
			const { taskId } = await createProjectAndTask(t)

			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			// Fail requirements
			await t.mutation(api.taskPhases.failPhase, {
				taskId,
				phase: "requirements",
				error: "Network timeout",
			})

			let phase = await t.query(api.taskPhases.getPhase, {
				taskId,
				phase: "requirements",
			})
			expect(phase?.status).toBe("failed")

			// Reset and retry
			await t.mutation(api.taskPhases.resetPhase, {
				taskId,
				phase: "requirements",
			})

			phase = await t.query(api.taskPhases.getPhase, {
				taskId,
				phase: "requirements",
			})
			expect(phase?.status).toBe("pending")

			// Start again
			await t.mutation(api.taskPhases.startPhase, {
				taskId,
				phase: "requirements",
			})

			phase = await t.query(api.taskPhases.getPhase, {
				taskId,
				phase: "requirements",
			})
			expect(phase?.status).toBe("in_progress")
		})
	})
})
