import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { deleteProjectCascade } from "./internal/cascadeDelete"

// List all non-archived projects
export const list = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("projects")
			.withIndex("by_archived", (q) => q.eq("archived", false))
			.collect()
	},
})

// List all projects including archived
export const listAll = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("projects").collect()
	},
})

// List archived projects only
export const listArchived = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("projects")
			.withIndex("by_archived", (q) => q.eq("archived", true))
			.collect()
	},
})

// Get project by ID
export const get = query({
	args: { id: v.id("projects") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id)
	},
})

// Get project with task statistics
export const getWithStats = query({
	args: { id: v.id("projects") },
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.id)
		if (!project) return null

		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_project", (q) => q.eq("projectId", args.id))
			.collect()

		const stats = {
			total: tasks.length,
			backlog: tasks.filter((t) => t.category === "backlog").length,
			todo: tasks.filter((t) => t.category === "todo").length,
			inProgress: tasks.filter((t) => t.category === "in-progress").length,
			done: tasks.filter((t) => t.category === "done").length,
		}

		return { ...project, stats }
	},
})

// Create new project
export const create = mutation({
	args: {
		name: v.string(),
		description: v.string(),
		plan: v.optional(v.string()),
		repo: v.string(), // Required - used for container cloning
		branch: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Validate repo format (should be owner/repo)
		if (!args.repo.includes("/")) {
			throw new Error("Repository must be in format 'owner/repo'")
		}

		const now = Date.now()
		const projectId = await ctx.db.insert("projects", {
			name: args.name,
			description: args.description,
			plan: args.plan,
			repo: args.repo,
			branch: args.branch || "main",
			archived: false,
			createdAt: now,
			updatedAt: now,
		})
		return projectId
	},
})

// Update project details
export const update = mutation({
	args: {
		id: v.id("projects"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		repo: v.optional(v.string()),
		branch: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { id, ...updates } = args
		const existing = await ctx.db.get(id)
		if (!existing) throw new Error("Project not found")

		await ctx.db.patch(id, {
			...updates,
			updatedAt: Date.now(),
		})
	},
})

// Update project plan/specification
export const updatePlan = mutation({
	args: {
		id: v.id("projects"),
		plan: v.string(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id)
		if (!existing) throw new Error("Project not found")

		await ctx.db.patch(args.id, {
			plan: args.plan,
			updatedAt: Date.now(),
		})
	},
})

// Archive a project
export const archive = mutation({
	args: { id: v.id("projects") },
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id)
		if (!existing) throw new Error("Project not found")

		await ctx.db.patch(args.id, {
			archived: true,
			updatedAt: Date.now(),
		})
	},
})

// Restore an archived project
export const restore = mutation({
	args: { id: v.id("projects") },
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id)
		if (!existing) throw new Error("Project not found")

		await ctx.db.patch(args.id, {
			archived: false,
			updatedAt: Date.now(),
		})
	},
})

// Delete a project and all related data
export const deleteProject = mutation({
	args: { id: v.id("projects") },
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id)
		if (!existing) throw new Error("Project not found")

		await deleteProjectCascade(ctx.db, args.id)
	},
})
