import { mutation } from "./_generated/server"
import { BUILTIN_TEMPLATES } from "./taskTemplates"

// Seed example acceptance criteria and tests for existing tasks
export const seedTaskData = mutation({
	args: {},
	handler: async (ctx) => {
		// Get all tasks
		const tasks = await ctx.db.query("tasks").collect()

		if (tasks.length === 0) {
			return { message: "No tasks found to seed data for" }
		}

		let seededCount = 0

		for (const task of tasks) {
			// Check if task already has acceptance criteria
			const existingCriteria = await ctx.db
				.query("acceptanceCriteria")
				.withIndex("by_task", (q) => q.eq("taskId", task._id))
				.first()

			// Check if task already has tests
			const existingTests = await ctx.db
				.query("tests")
				.withIndex("by_task", (q) => q.eq("taskId", task._id))
				.first()

			// Only seed if no existing data
			if (!existingCriteria && !existingTests) {
				// Add sample acceptance criteria
				const sampleCriteria = [
					{ text: "Component renders without errors", done: true },
					{ text: "All edge cases are handled", done: true },
					{ text: "Code follows project style guidelines", done: false },
					{ text: "Documentation is updated", done: false },
				]

				for (let i = 0; i < sampleCriteria.length; i++) {
					const criteria = sampleCriteria[i]!
					await ctx.db.insert("acceptanceCriteria", {
						taskId: task._id,
						text: criteria.text,
						done: criteria.done,
						order: i + 1,
					})
				}

				// Add sample tests
				const sampleTests = [
					{ name: "test_component_renders", status: "passed" as const },
					{ name: "test_handles_empty_input", status: "passed" as const },
					{ name: "test_handles_invalid_data", status: "failed" as const },
					{ name: "test_integration_with_api", status: "pending" as const },
				]

				for (const test of sampleTests) {
					await ctx.db.insert("tests", {
						taskId: task._id,
						name: test.name,
						status: test.status,
					})
				}

				seededCount++
			}
		}

		return { message: `Seeded data for ${seededCount} tasks` }
	},
})

// Clear all acceptance criteria and tests (for testing)
export const clearTaskData = mutation({
	args: {},
	handler: async (ctx) => {
		const criteria = await ctx.db.query("acceptanceCriteria").collect()
		const tests = await ctx.db.query("tests").collect()

		for (const c of criteria) {
			await ctx.db.delete(c._id)
		}

		for (const t of tests) {
			await ctx.db.delete(t._id)
		}

		return {
			message: `Cleared ${criteria.length} acceptance criteria and ${tests.length} tests`,
		}
	},
})

// Seed built-in task templates
export const seedTemplates = mutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now()
		const created: string[] = []

		for (const template of BUILTIN_TEMPLATES) {
			// Check if template already exists
			const existing = await ctx.db
				.query("taskTemplates")
				.withIndex("by_name", (q) => q.eq("name", template.name))
				.first()

			if (!existing) {
				await ctx.db.insert("taskTemplates", {
					name: template.name,
					description: template.description,
					phases: template.phases,
					isDefault: template.isDefault,
					isBuiltin: true,
					createdAt: now,
					updatedAt: now,
				})
				created.push(template.name)
			}
		}

		return {
			message:
				created.length > 0
					? `Created templates: ${created.join(", ")}`
					: "All templates already exist",
		}
	},
})
