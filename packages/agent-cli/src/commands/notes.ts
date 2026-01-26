/**
 * Notes commands (Chat Messages)
 *
 * Commands for adding and listing notes/messages on tasks and projects.
 */

import { Command } from "commander"
import type { Id } from "@agent-manager/convex/dataModel"
import { getClient, api } from "../client"
import { success, withErrorHandler, error } from "../utils/output"
import { validateId, validateRequired, validateNumber } from "../utils/validators"

export function registerNotesCommands(program: Command): void {
	const notes = program.command("notes").description("Notes/chat message commands")

	// Add a note
	notes
		.command("add")
		.description("Add a note to a task or project")
		.option("--task-id <id>", "Task ID (mutually exclusive with project-id)")
		.option("--project-id <id>", "Project ID (mutually exclusive with task-id)")
		.requiredOption("--text <text>", "Note text")
		.action(
			withErrorHandler(async (options: { taskId?: string; projectId?: string; text: string }) => {
				validateRequired(options.text, "text")

				if (options.taskId && options.projectId) {
					error("Cannot specify both --task-id and --project-id")
				}

				if (!options.taskId && !options.projectId) {
					error("Must specify either --task-id or --project-id")
				}

				const client = getClient()

				if (options.taskId) {
					validateId(options.taskId, "task-id")

					// Get task summary
					const task = await client.query(api.tasks.get, {
						id: options.taskId as Id<"tasks">,
					})

					if (!task) {
						success({ task: null, message: "Task not found" })
						return
					}

					const messageId = await client.mutation(api.chat.sendTaskMessage, {
						taskId: options.taskId as Id<"tasks">,
						text: options.text,
						sender: "ai", // Agent-added notes are marked as AI
					})

					success({
						task: {
							id: task._id,
							title: task.title,
						},
						note: {
							id: messageId,
							text: options.text,
							sender: "ai",
						},
					})
				} else if (options.projectId) {
					validateId(options.projectId, "project-id")

					// Get project summary
					const project = await client.query(api.projects.get, {
						id: options.projectId as Id<"projects">,
					})

					if (!project) {
						success({ project: null, message: "Project not found" })
						return
					}

					const messageId = await client.mutation(api.chat.sendProjectMessage, {
						projectId: options.projectId as Id<"projects">,
						text: options.text,
						sender: "ai",
					})

					success({
						project: {
							id: project._id,
							name: project.name,
						},
						note: {
							id: messageId,
							text: options.text,
							sender: "ai",
						},
					})
				}
			}),
		)

	// List notes
	notes
		.command("list")
		.description("List notes for a task or project")
		.option("--task-id <id>", "Task ID (mutually exclusive with project-id)")
		.option("--project-id <id>", "Project ID (mutually exclusive with task-id)")
		.option("--limit <number>", "Maximum number of notes to return")
		.action(
			withErrorHandler(async (options: { taskId?: string; projectId?: string; limit?: string }) => {
				if (options.taskId && options.projectId) {
					error("Cannot specify both --task-id and --project-id")
				}

				if (!options.taskId && !options.projectId) {
					error("Must specify either --task-id or --project-id")
				}

				const limit = validateNumber(options.limit, "limit")
				const client = getClient()

				if (options.taskId) {
					validateId(options.taskId, "task-id")

					// Get task summary
					const task = await client.query(api.tasks.get, {
						id: options.taskId as Id<"tasks">,
					})

					if (!task) {
						success({ task: null, notes: [], message: "Task not found" })
						return
					}

					const messages = await client.query(api.chat.listByTask, {
						taskId: options.taskId as Id<"tasks">,
					})

					// Apply limit if specified
					const limitedMessages = limit ? messages.slice(-limit) : messages

					success({
						task: {
							id: task._id,
							title: task.title,
						},
						notes: limitedMessages.map((m) => ({
							id: m._id,
							text: m.text,
							sender: m.sender,
							createdAt: m.createdAt,
						})),
					})
				} else if (options.projectId) {
					validateId(options.projectId, "project-id")

					// Get project summary
					const project = await client.query(api.projects.get, {
						id: options.projectId as Id<"projects">,
					})

					if (!project) {
						success({ project: null, notes: [], message: "Project not found" })
						return
					}

					const messages = await client.query(api.chat.listByProject, {
						projectId: options.projectId as Id<"projects">,
					})

					// Apply limit if specified
					const limitedMessages = limit ? messages.slice(-limit) : messages

					success({
						project: {
							id: project._id,
							name: project.name,
						},
						notes: limitedMessages.map((m) => ({
							id: m._id,
							text: m.text,
							sender: m.sender,
							createdAt: m.createdAt,
						})),
					})
				}
			}),
		)
}
