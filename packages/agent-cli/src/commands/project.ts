/**
 * Project commands
 *
 * Commands for project management - get details, list, update plan, stats.
 */

import type { Id } from "@agent-manager/convex/dataModel"
import type { Command } from "commander"
import { api, getClient } from "../client"
import { success, withErrorHandler } from "../utils/output"
import { validateId, validateRequired } from "../utils/validators"

export function registerProjectCommands(program: Command): void {
	const project = program
		.command("project")
		.description("Project management commands")

	// Get project details
	project
		.command("get <project-id>")
		.description("Get project details including repo and branch")
		.action(
			withErrorHandler(async (projectId: string) => {
				validateId(projectId, "project-id")
				const client = getClient()

				const proj = await client.query(api.projects.get, {
					id: projectId as Id<"projects">,
				})

				if (!proj) {
					success({ project: null, message: "Project not found" })
					return
				}

				success({
					project: {
						id: proj._id,
						name: proj.name,
						description: proj.description,
						plan: proj.plan,
						repo: proj.repo,
						branch: proj.branch,
						archived: proj.archived,
						createdAt: proj.createdAt,
						updatedAt: proj.updatedAt,
					},
				})
			}),
		)

	// List all projects
	project
		.command("list")
		.description("List all active projects")
		.option("--include-archived", "Include archived projects")
		.action(
			withErrorHandler(async (options: { includeArchived?: boolean }) => {
				const client = getClient()

				const projects = options.includeArchived
					? await client.query(api.projects.listAll, {})
					: await client.query(api.projects.list, {})

				success({
					projects: projects.map((p) => ({
						id: p._id,
						name: p.name,
						description: p.description,
						repo: p.repo,
						branch: p.branch,
						archived: p.archived,
					})),
				})
			}),
		)

	// Update project plan
	project
		.command("update-plan <project-id>")
		.description("Update the project plan/specification")
		.requiredOption("--plan <plan>", "New plan content")
		.action(
			withErrorHandler(async (projectId: string, options: { plan: string }) => {
				validateId(projectId, "project-id")
				validateRequired(options.plan, "plan")
				const client = getClient()

				await client.mutation(api.projects.updatePlan, {
					id: projectId as Id<"projects">,
					plan: options.plan,
				})

				// Fetch updated project
				const proj = await client.query(api.projects.get, {
					id: projectId as Id<"projects">,
				})

				success({
					project: proj
						? {
								id: proj._id,
								name: proj.name,
								plan: proj.plan,
							}
						: null,
				})
			}),
		)

	// Get project stats
	project
		.command("stats <project-id>")
		.description("Get project statistics including task counts by category")
		.action(
			withErrorHandler(async (projectId: string) => {
				validateId(projectId, "project-id")
				const client = getClient()

				const proj = await client.query(api.projects.getWithStats, {
					id: projectId as Id<"projects">,
				})

				if (!proj) {
					success({ project: null, stats: null, message: "Project not found" })
					return
				}

				success({
					project: {
						id: proj._id,
						name: proj.name,
					},
					stats: proj.stats,
				})
			}),
		)
}
