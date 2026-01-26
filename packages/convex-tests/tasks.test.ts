/**
 * Tasks - Task Management Tests
 *
 * Tests the task management system including:
 * - Task creation with project association
 * - Task updates and category changes
 * - Task dependencies
 * - Task deletion cascade
 */

import { describe, expect, it } from "bun:test"
import { api, internal } from "../convex/_generated/api"
import type { Id } from "../convex/_generated/dataModel"
import schema from "../convex/schema"
import { createConvexTest } from "./setup"

describe("tasks", () => {
	// Helper to create a project
	async function createProject(
		t: Awaited<ReturnType<typeof createConvexTest>>,
	) {
		return await t.mutation(api.projects.create, {
			name: "Test Project",
			description: "Test Description",
		})
	}

	// Helper to create a task without triggering the scheduler
	async function createTaskDirect(
		t: Awaited<ReturnType<typeof createConvexTest>>,
		projectId: Id<"projects">,
		overrides: Partial<{
			title: string
			description: string
			category: "backlog" | "todo" | "in-progress" | "done"
			tag: string
			complexity: string
			order: number
			prompt: string
		}> = {},
	) {
		const taskId = await t.run(async (ctx) => {
			return await ctx.db.insert("tasks", {
				projectId,
				title: overrides.title ?? "Test Task",
				description: overrides.description ?? "Test Description",
				category: overrides.category ?? "backlog",
				tag: overrides.tag ?? "feature",
				complexity: overrides.complexity ?? "medium",
				order: overrides.order ?? 0,
				prompt: overrides.prompt,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
		})
		return taskId
	}

	describe("create", () => {
		it("should create a task with required fields via direct insert", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			const taskId = await createTaskDirect(t, projectId, {
				title: "Implement feature X",
				description: "Add the X feature to the system",
				category: "backlog",
				tag: "feature",
				complexity: "medium",
			})

			expect(taskId).toBeDefined()

			const task = await t.query(api.tasks.get, { id: taskId })
			expect(task?.title).toBe("Implement feature X")
			expect(task?.description).toBe("Add the X feature to the system")
			expect(task?.category).toBe("backlog")
			expect(task?.tag).toBe("feature")
			expect(task?.complexity).toBe("medium")
		})

		it("should create task with optional prompt", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			const taskId = await createTaskDirect(t, projectId, {
				title: "Task with prompt",
				description: "Description",
				prompt: "Detailed implementation prompt...",
				category: "backlog",
				tag: "feature",
				complexity: "low",
			})

			const task = await t.query(api.tasks.get, { id: taskId })
			expect(task?.prompt).toBe("Detailed implementation prompt...")
		})

		it("should initialize phases via internal mutation", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			const taskId = await createTaskDirect(t, projectId, {
				title: "Task",
				description: "Description",
				complexity: "low",
			})

			// Manually call initializePhases (simulating what the scheduler would do)
			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			const phases = await t.query(api.taskPhases.listByTask, { taskId })
			expect(phases.length).toBeGreaterThan(0)
		})
	})

	describe("update", () => {
		it("should update task fields", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			const taskId = await createTaskDirect(t, projectId, {
				title: "Original Title",
				description: "Original description",
				complexity: "low",
			})

			await t.mutation(api.tasks.update, {
				id: taskId,
				title: "Updated Title",
				description: "Updated description",
				complexity: "high",
			})

			const task = await t.query(api.tasks.get, { id: taskId })
			expect(task?.title).toBe("Updated Title")
			expect(task?.description).toBe("Updated description")
			expect(task?.complexity).toBe("high")
		})
	})

	describe("updateCategory", () => {
		it("should move task to different category", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			const taskId = await createTaskDirect(t, projectId, {
				title: "Task",
				description: "Description",
				category: "backlog",
			})

			await t.mutation(api.tasks.updateCategory, {
				id: taskId,
				category: "in-progress",
			})

			const task = await t.query(api.tasks.get, { id: taskId })
			expect(task?.category).toBe("in-progress")
		})

		it("should assign new order in target category", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			// Create task in todo
			await createTaskDirect(t, projectId, {
				title: "Existing Todo Task",
				category: "todo",
				order: 0,
			})

			// Create task in backlog
			const taskId = await createTaskDirect(t, projectId, {
				title: "Moving Task",
				category: "backlog",
				order: 0,
			})

			// Move to todo
			await t.mutation(api.tasks.updateCategory, {
				id: taskId,
				category: "todo",
			})

			const task = await t.query(api.tasks.get, { id: taskId })
			expect(task?.order).toBeGreaterThan(0)
		})
	})

	describe("dependencies", () => {
		it("should add dependency between tasks", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			const task1Id = await createTaskDirect(t, projectId, {
				title: "Task 1",
				description: "First task",
			})

			const task2Id = await createTaskDirect(t, projectId, {
				title: "Task 2",
				description: "Depends on Task 1",
			})

			await t.mutation(api.tasks.addDependency, {
				taskId: task2Id,
				dependsOnTaskId: task1Id,
			})

			const dependencies = await t.query(api.tasks.getDependencies, {
				taskId: task2Id,
			})

			expect(dependencies.length).toBe(1)
			expect(dependencies[0]?.title).toBe("Task 1")
		})

		it("should get tasks blocked by a task", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			const task1Id = await createTaskDirect(t, projectId, {
				title: "Blocking Task",
				description: "This blocks others",
			})

			const task2Id = await createTaskDirect(t, projectId, {
				title: "Blocked Task",
				description: "Blocked by Task 1",
			})

			await t.mutation(api.tasks.addDependency, {
				taskId: task2Id,
				dependsOnTaskId: task1Id,
			})

			const blockedBy = await t.query(api.tasks.getBlockedBy, {
				taskId: task1Id,
			})

			expect(blockedBy.length).toBe(1)
			expect(blockedBy[0]?.title).toBe("Blocked Task")
		})

		it("should remove dependency", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			const task1Id = await createTaskDirect(t, projectId, {
				title: "Task 1",
			})

			const task2Id = await createTaskDirect(t, projectId, {
				title: "Task 2",
			})

			await t.mutation(api.tasks.addDependency, {
				taskId: task2Id,
				dependsOnTaskId: task1Id,
			})

			await t.mutation(api.tasks.removeDependency, {
				taskId: task2Id,
				dependsOnTaskId: task1Id,
			})

			const dependencies = await t.query(api.tasks.getDependencies, {
				taskId: task2Id,
			})

			expect(dependencies.length).toBe(0)
		})

		it("should not create duplicate dependencies", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			const task1Id = await createTaskDirect(t, projectId, {
				title: "Task 1",
			})

			const task2Id = await createTaskDirect(t, projectId, {
				title: "Task 2",
			})

			// Add same dependency twice
			const dep1 = await t.mutation(api.tasks.addDependency, {
				taskId: task2Id,
				dependsOnTaskId: task1Id,
			})

			const dep2 = await t.mutation(api.tasks.addDependency, {
				taskId: task2Id,
				dependsOnTaskId: task1Id,
			})

			// Should return same ID (existing dependency)
			expect(dep1).toEqual(dep2)

			const dependencies = await t.query(api.tasks.getDependencies, {
				taskId: task2Id,
			})
			expect(dependencies.length).toBe(1)
		})
	})

	describe("queries", () => {
		it("should list tasks by project", async () => {
			const t = await createConvexTest(schema)
			const project1Id = await createProject(t)
			const project2Id = await t.mutation(api.projects.create, {
				name: "Other Project",
				description: "Description",
			})

			await createTaskDirect(t, project1Id, {
				title: "Project 1 Task",
			})

			await createTaskDirect(t, project2Id, {
				title: "Project 2 Task",
			})

			const project1Tasks = await t.query(api.tasks.listByProject, {
				projectId: project1Id,
			})

			expect(project1Tasks.length).toBe(1)
			expect(project1Tasks[0]?.title).toBe("Project 1 Task")
		})

		it("should list tasks by category", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			await createTaskDirect(t, projectId, {
				title: "Backlog Task",
				category: "backlog",
			})

			await createTaskDirect(t, projectId, {
				title: "Todo Task",
				category: "todo",
			})

			const backlogTasks = await t.query(api.tasks.listByCategory, {
				projectId,
				category: "backlog",
			})

			expect(backlogTasks.length).toBe(1)
			expect(backlogTasks[0]?.title).toBe("Backlog Task")
		})

		it("should get full task with all related data", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			const taskId = await createTaskDirect(t, projectId, {
				title: "Full Task",
				complexity: "medium",
			})

			// Manually initialize phases
			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			const task = await t.query(api.tasks.get, { id: taskId })

			expect(task?.title).toBe("Full Task")
			expect(task?.acceptanceCriteria).toBeDefined()
			expect(task?.tests).toBeDefined()
			expect(task?.chatHistory).toBeDefined()
			expect(task?.history).toBeDefined()
			expect(task?.dependencies).toBeDefined()
			expect(task?.phases).toBeDefined()
			expect(task?.phases.length).toBeGreaterThan(0)
		})
	})

	describe("reorder", () => {
		it("should reorder tasks within category", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			const task1Id = await createTaskDirect(t, projectId, {
				title: "Task 1",
				order: 0,
			})

			const task2Id = await createTaskDirect(t, projectId, {
				title: "Task 2",
				order: 1,
			})

			const task3Id = await createTaskDirect(t, projectId, {
				title: "Task 3",
				order: 2,
			})

			// Reorder: 3, 1, 2
			await t.mutation(api.tasks.reorder, {
				projectId,
				category: "backlog",
				taskIds: [task3Id, task1Id, task2Id],
			})

			const tasks = await t.query(api.tasks.listByCategory, {
				projectId,
				category: "backlog",
			})

			// Should be sorted by order
			expect(tasks[0]?.title).toBe("Task 3")
			expect(tasks[1]?.title).toBe("Task 1")
			expect(tasks[2]?.title).toBe("Task 2")
		})
	})

	describe("delete", () => {
		it("should delete task and related data", async () => {
			const t = await createConvexTest(schema)
			const projectId = await createProject(t)

			const taskId = await createTaskDirect(t, projectId, {
				title: "Task to Delete",
			})

			// Manually initialize phases
			await t.mutation(internal.taskPhases.initializePhases, { taskId })

			// Verify task exists
			let task = await t.query(api.tasks.get, { id: taskId })
			expect(task).toBeDefined()

			// Delete task
			await t.mutation(api.tasks.deleteTask, { id: taskId })

			// Task should be gone
			task = await t.query(api.tasks.get, { id: taskId })
			expect(task).toBeNull()
		})
	})
})
