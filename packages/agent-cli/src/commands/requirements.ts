/**
 * Requirements commands (Acceptance Criteria)
 *
 * Commands for managing acceptance criteria on tasks.
 */

import type { Id } from "@agent-manager/convex/dataModel"
import type { Command } from "commander"
import { api, getClient } from "../client"
import { success, withErrorHandler } from "../utils/output"
import {
	parseJsonArray,
	validateBoolean,
	validateId,
	validateRequired,
} from "../utils/validators"

export function registerRequirementsCommands(program: Command): void {
	const requirements = program
		.command("requirements")
		.description("Acceptance criteria management commands")

	// List requirements for a task
	requirements
		.command("list")
		.description("List acceptance criteria for a task")
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
					success({ task: null, requirements: [], message: "Task not found" })
					return
				}

				const criteria = await client.query(api.acceptanceCriteria.listByTask, {
					taskId: options.taskId as Id<"tasks">,
				})

				success({
					task: {
						id: task._id,
						title: task.title,
					},
					requirements: criteria.map((c) => ({
						id: c._id,
						text: c.text,
						done: c.done,
						order: c.order,
					})),
				})
			}),
		)

	// Add a single requirement
	requirements
		.command("add")
		.description("Add a new acceptance criterion")
		.requiredOption("--task-id <id>", "Task ID")
		.requiredOption("--text <text>", "Requirement text")
		.action(
			withErrorHandler(async (options: { taskId: string; text: string }) => {
				validateId(options.taskId, "task-id")
				validateRequired(options.text, "text")
				const client = getClient()

				// Get task summary
				const task = await client.query(api.tasks.get, {
					id: options.taskId as Id<"tasks">,
				})

				if (!task) {
					success({ task: null, requirement: null, message: "Task not found" })
					return
				}

				const criteriaId = await client.mutation(
					api.acceptanceCriteria.create,
					{
						taskId: options.taskId as Id<"tasks">,
						text: options.text,
					},
				)

				success({
					task: {
						id: task._id,
						title: task.title,
					},
					requirement: {
						id: criteriaId,
						text: options.text,
						done: false,
					},
				})
			}),
		)

	// Add multiple requirements
	requirements
		.command("add-bulk")
		.description("Add multiple acceptance criteria at once")
		.requiredOption("--task-id <id>", "Task ID")
		.requiredOption(
			"--items <json>",
			'JSON array of requirement texts, e.g. \'["Req 1", "Req 2"]\'',
		)
		.action(
			withErrorHandler(async (options: { taskId: string; items: string }) => {
				validateId(options.taskId, "task-id")
				const items = parseJsonArray(options.items, "items")
				const client = getClient()

				// Get task summary
				const task = await client.query(api.tasks.get, {
					id: options.taskId as Id<"tasks">,
				})

				if (!task) {
					success({ task: null, requirements: [], message: "Task not found" })
					return
				}

				const ids = await client.mutation(api.acceptanceCriteria.bulkCreate, {
					taskId: options.taskId as Id<"tasks">,
					items,
				})

				success({
					task: {
						id: task._id,
						title: task.title,
					},
					requirements: items.map((text, i) => ({
						id: ids[i],
						text,
						done: false,
					})),
				})
			}),
		)

	// Update requirement text
	requirements
		.command("update <criteria-id>")
		.description("Update requirement text")
		.requiredOption("--text <text>", "New requirement text")
		.action(
			withErrorHandler(
				async (criteriaId: string, options: { text: string }) => {
					validateId(criteriaId, "criteria-id")
					validateRequired(options.text, "text")
					const client = getClient()

					await client.mutation(api.acceptanceCriteria.update, {
						id: criteriaId as Id<"acceptanceCriteria">,
						text: options.text,
					})

					success({
						requirement: {
							id: criteriaId,
							text: options.text,
						},
					})
				},
			),
		)

	// Set done status
	requirements
		.command("set-done <criteria-id>")
		.description("Mark requirement as done or not done")
		.requiredOption("--done <boolean>", "Done status (true or false)")
		.action(
			withErrorHandler(
				async (criteriaId: string, options: { done: string }) => {
					validateId(criteriaId, "criteria-id")
					const done = validateBoolean(options.done, "done")
					const client = getClient()

					await client.mutation(api.acceptanceCriteria.setDone, {
						id: criteriaId as Id<"acceptanceCriteria">,
						done,
					})

					success({
						requirement: {
							id: criteriaId,
							done,
						},
					})
				},
			),
		)

	// Delete a requirement
	requirements
		.command("delete <criteria-id>")
		.description("Delete an acceptance criterion")
		.action(
			withErrorHandler(async (criteriaId: string) => {
				validateId(criteriaId, "criteria-id")
				const client = getClient()

				await client.mutation(api.acceptanceCriteria.deleteCriteria, {
					id: criteriaId as Id<"acceptanceCriteria">,
				})

				success({
					message: "Requirement deleted",
					deletedId: criteriaId,
				})
			}),
		)

	// Clear all requirements for a task
	requirements
		.command("clear")
		.description("Delete all acceptance criteria for a task")
		.requiredOption("--task-id <id>", "Task ID")
		.action(
			withErrorHandler(async (options: { taskId: string }) => {
				validateId(options.taskId, "task-id")
				const client = getClient()

				// Get current criteria count
				const criteria = await client.query(api.acceptanceCriteria.listByTask, {
					taskId: options.taskId as Id<"tasks">,
				})

				// Delete each one
				for (const c of criteria) {
					await client.mutation(api.acceptanceCriteria.deleteCriteria, {
						id: c._id,
					})
				}

				success({
					message: "All requirements cleared",
					deletedCount: criteria.length,
				})
			}),
		)
}
