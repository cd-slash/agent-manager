/**
 * Phase commands (read-only)
 *
 * Commands for viewing phase information for tasks.
 */

import type { Id } from "@agent-manager/convex/dataModel"
import type { Command } from "commander"
import { api, getClient } from "../client"
import { success, withErrorHandler } from "../utils/output"
import { validateId } from "../utils/validators"

export function registerPhaseCommands(program: Command): void {
	const phase = program
		.command("phase")
		.description("Task phase information commands (read-only)")

	// Get current phase
	phase
		.command("current")
		.description("Get the current phase for a task")
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
					success({ task: null, currentPhase: null, message: "Task not found" })
					return
				}

				const currentPhase = await client.query(
					api.taskPhases.getCurrentPhase,
					{
						taskId: options.taskId as Id<"tasks">,
					},
				)

				success({
					task: {
						id: task._id,
						title: task.title,
						currentPhaseName: task.currentPhase,
					},
					currentPhase: currentPhase
						? {
								id: currentPhase._id,
								phase: currentPhase.phase,
								status: currentPhase.status,
								startedAt: currentPhase.startedAt,
								completedAt: currentPhase.completedAt,
								provider: currentPhase.provider,
								model: currentPhase.model,
								result: currentPhase.result,
								error: currentPhase.error,
								totalCostUsd: currentPhase.totalCostUsd,
								numTurns: currentPhase.numTurns,
							}
						: null,
				})
			}),
		)

	// List all phases for a task
	phase
		.command("list")
		.description("List all phases for a task with their status")
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
					success({ task: null, phases: [], message: "Task not found" })
					return
				}

				const phases = await client.query(api.taskPhases.listByTask, {
					taskId: options.taskId as Id<"tasks">,
				})

				success({
					task: {
						id: task._id,
						title: task.title,
						currentPhaseName: task.currentPhase,
					},
					phases: phases.map((p) => ({
						id: p._id,
						phase: p.phase,
						status: p.status,
						order: p.order,
						startedAt: p.startedAt,
						completedAt: p.completedAt,
						provider: p.provider,
						model: p.model,
						totalCostUsd: p.totalCostUsd,
						numTurns: p.numTurns,
						error: p.error,
					})),
				})
			}),
		)
}
