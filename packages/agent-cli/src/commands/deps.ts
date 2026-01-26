/**
 * Dependencies commands
 *
 * Commands for managing task dependencies.
 */

import { Command } from "commander"
import type { Id } from "@agent-manager/convex/dataModel"
import { getClient, api } from "../client"
import { success, withErrorHandler } from "../utils/output"
import { validateId } from "../utils/validators"

export function registerDepsCommands(program: Command): void {
	const deps = program.command("deps").description("Task dependency management commands")

	// List dependencies for a task
	deps
		.command("list")
		.description("List tasks that this task depends on")
		.requiredOption("--task-id <id>", "Task ID")
		.action(
			withErrorHandler(async (options: { taskId: string }) => {
				validateId(options.taskId, "task-id")
				const client = getClient()

				// Get task summary
				const task = await client.query(api.tasks.get, {
					id: options.taskId as Id<"tasks">,
				})

				if (!task) {
					success({ task: null, dependencies: [], message: "Task not found" })
					return
				}

				const dependencies = await client.query(api.tasks.getDependencies, {
					taskId: options.taskId as Id<"tasks">,
				})

				// Filter out any null values and map to output format
				const validDependencies = dependencies.filter(
					(d): d is NonNullable<typeof d> => d !== null,
				)

				success({
					task: {
						id: task._id,
						title: task.title,
					},
					dependencies: validDependencies.map((d) => ({
						id: d._id,
						title: d.title,
						category: d.category,
						currentPhase: d.currentPhase,
					})),
				})
			}),
		)

	// Add a dependency
	deps
		.command("add")
		.description("Add a dependency (task depends on another task)")
		.requiredOption("--task-id <id>", "Task ID")
		.requiredOption("--depends-on <id>", "ID of task that this task depends on")
		.action(
			withErrorHandler(async (options: { taskId: string; dependsOn: string }) => {
				validateId(options.taskId, "task-id")
				validateId(options.dependsOn, "depends-on")
				const client = getClient()

				await client.mutation(api.tasks.addDependency, {
					taskId: options.taskId as Id<"tasks">,
					dependsOnTaskId: options.dependsOn as Id<"tasks">,
				})

				// Get updated dependencies
				const dependencies = await client.query(api.tasks.getDependencies, {
					taskId: options.taskId as Id<"tasks">,
				})

				// Filter out any null values
				const validDependencies = dependencies.filter(
					(d): d is NonNullable<typeof d> => d !== null,
				)

				success({
					message: "Dependency added",
					dependencies: validDependencies.map((d) => ({
						id: d._id,
						title: d.title,
					})),
				})
			}),
		)

	// Remove a dependency
	deps
		.command("remove")
		.description("Remove a dependency")
		.requiredOption("--task-id <id>", "Task ID")
		.requiredOption("--depends-on <id>", "ID of task to remove from dependencies")
		.action(
			withErrorHandler(async (options: { taskId: string; dependsOn: string }) => {
				validateId(options.taskId, "task-id")
				validateId(options.dependsOn, "depends-on")
				const client = getClient()

				await client.mutation(api.tasks.removeDependency, {
					taskId: options.taskId as Id<"tasks">,
					dependsOnTaskId: options.dependsOn as Id<"tasks">,
				})

				// Get updated dependencies
				const dependencies = await client.query(api.tasks.getDependencies, {
					taskId: options.taskId as Id<"tasks">,
				})

				// Filter out any null values
				const validDependencies = dependencies.filter(
					(d): d is NonNullable<typeof d> => d !== null,
				)

				success({
					message: "Dependency removed",
					dependencies: validDependencies.map((d) => ({
						id: d._id,
						title: d.title,
					})),
				})
			}),
		)

	// List tasks blocked by this task
	deps
		.command("blocked-by")
		.description("List tasks that are blocked by this task (depend on this task)")
		.requiredOption("--task-id <id>", "Task ID")
		.action(
			withErrorHandler(async (options: { taskId: string }) => {
				validateId(options.taskId, "task-id")
				const client = getClient()

				// Get task summary
				const task = await client.query(api.tasks.get, {
					id: options.taskId as Id<"tasks">,
				})

				if (!task) {
					success({ task: null, blockedTasks: [], message: "Task not found" })
					return
				}

				const blockedBy = await client.query(api.tasks.getBlockedBy, {
					taskId: options.taskId as Id<"tasks">,
				})

				// Filter out any null values
				const validBlockedTasks = blockedBy.filter(
					(t): t is NonNullable<typeof t> => t !== null,
				)

				success({
					task: {
						id: task._id,
						title: task.title,
					},
					blockedTasks: validBlockedTasks.map((t) => ({
						id: t._id,
						title: t.title,
						category: t.category,
						currentPhase: t.currentPhase,
					})),
				})
			}),
		)
}
