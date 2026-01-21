import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { taskPhaseValidator } from "./validators";

// Type for task phases
type TaskPhase = "requirements" | "planning" | "implementation" | "ai_review" | "remediation" | "human_review" | "merge";

// Built-in templates that ship with the system
export const BUILTIN_TEMPLATES: Array<{
  name: string;
  description: string;
  phases: TaskPhase[];
  isDefault: boolean;
}> = [
  {
    name: "Standard",
    description: "Full lifecycle with planning, AI review, remediation, and human review",
    phases: ["requirements", "planning", "implementation", "ai_review", "remediation", "human_review", "merge"],
    isDefault: true,
  },
  {
    name: "Quick Fix",
    description: "Fast path for simple fixes - goes directly from prompt to implementation to human review",
    phases: ["requirements", "implementation", "human_review", "merge"],
    isDefault: false,
  },
  {
    name: "Auto Review",
    description: "Full automation with AI review but no human review - for trusted changes",
    phases: ["requirements", "planning", "implementation", "ai_review", "remediation", "merge"],
    isDefault: false,
  },
  {
    name: "Human Only",
    description: "Skip AI review - human reviewer validates all changes directly",
    phases: ["requirements", "planning", "implementation", "human_review", "merge"],
    isDefault: false,
  },
  {
    name: "Prototype",
    description: "Minimal flow for rapid prototyping - no reviews, direct to merge",
    phases: ["requirements", "implementation", "merge"],
    isDefault: false,
  },
];

// Default phase order - used when no template is specified
// This is the Standard template's phases
export const DEFAULT_PHASE_ORDER = BUILTIN_TEMPLATES[0]!.phases;

// Get all templates
export const list = query({
  args: {},
  handler: async (ctx) => {
    const templates = await ctx.db.query("taskTemplates").collect();
    return templates.sort((a, b) => {
      // Put default first, then sort by name
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  },
});

// Get a specific template by ID
export const get = query({
  args: { id: v.id("taskTemplates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get the default template
export const getDefault = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("taskTemplates")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .first();
  },
});

// Get template by name
export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskTemplates")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

// Get phases for a template (or default if no template specified)
export const getPhases = query({
  args: { templateId: v.optional(v.id("taskTemplates")) },
  handler: async (ctx, args) => {
    if (args.templateId) {
      const template = await ctx.db.get(args.templateId);
      if (template) {
        return template.phases;
      }
    }

    // Fall back to default template
    const defaultTemplate = await ctx.db
      .query("taskTemplates")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .first();

    if (defaultTemplate) {
      return defaultTemplate.phases;
    }

    // Fall back to built-in standard template
    return BUILTIN_TEMPLATES[0]!.phases;
  },
});

// Create a new template
export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    phases: v.array(taskPhaseValidator),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { name, description, phases, isDefault = false } = args;

    // Check for duplicate name
    const existing = await ctx.db
      .query("taskTemplates")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();

    if (existing) {
      throw new Error(`Template with name "${name}" already exists`);
    }

    // Validate phases array
    if (phases.length === 0) {
      throw new Error("Template must have at least one phase");
    }

    // Require essential phases
    if (!phases.includes("requirements")) {
      throw new Error("Template must include the requirements phase");
    }
    if (!phases.includes("merge")) {
      throw new Error("Template must include the merge phase");
    }

    // If this is being set as default, unset the current default
    if (isDefault) {
      const currentDefault = await ctx.db
        .query("taskTemplates")
        .withIndex("by_default", (q) => q.eq("isDefault", true))
        .first();

      if (currentDefault) {
        await ctx.db.patch(currentDefault._id, { isDefault: false });
      }
    }

    const now = Date.now();
    return await ctx.db.insert("taskTemplates", {
      name,
      description,
      phases,
      isDefault,
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update a template
export const update = mutation({
  args: {
    id: v.id("taskTemplates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    phases: v.optional(v.array(taskPhaseValidator)),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const template = await ctx.db.get(id);
    if (!template) {
      throw new Error("Template not found");
    }

    // Don't allow modifying built-in templates' phases
    if (template.isBuiltin && updates.phases) {
      throw new Error("Cannot modify phases of built-in templates");
    }

    // Check for duplicate name if changing name
    if (updates.name && updates.name !== template.name) {
      const existing = await ctx.db
        .query("taskTemplates")
        .withIndex("by_name", (q) => q.eq("name", updates.name!))
        .first();

      if (existing) {
        throw new Error(`Template with name "${updates.name}" already exists`);
      }
    }

    // Validate phases if provided
    if (updates.phases) {
      if (updates.phases.length === 0) {
        throw new Error("Template must have at least one phase");
      }
      if (!updates.phases.includes("requirements")) {
        throw new Error("Template must include the requirements phase");
      }
      if (!updates.phases.includes("merge")) {
        throw new Error("Template must include the merge phase");
      }
    }

    // If this is being set as default, unset the current default
    if (updates.isDefault === true && !template.isDefault) {
      const currentDefault = await ctx.db
        .query("taskTemplates")
        .withIndex("by_default", (q) => q.eq("isDefault", true))
        .first();

      if (currentDefault && currentDefault._id !== id) {
        await ctx.db.patch(currentDefault._id, { isDefault: false });
      }
    }

    // Don't allow unsetting default if this is the only template
    if (updates.isDefault === false && template.isDefault) {
      const templates = await ctx.db.query("taskTemplates").collect();
      if (templates.length === 1) {
        throw new Error("Cannot unset default when this is the only template");
      }
    }

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });

    return id;
  },
});

// Delete a template
export const remove = mutation({
  args: { id: v.id("taskTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) {
      throw new Error("Template not found");
    }

    // Don't allow deleting built-in templates
    if (template.isBuiltin) {
      throw new Error("Cannot delete built-in templates");
    }

    // Don't allow deleting the default template
    if (template.isDefault) {
      throw new Error("Cannot delete the default template. Set another template as default first.");
    }

    // Check if any tasks use this template
    const tasksUsingTemplate = await ctx.db
      .query("tasks")
      .withIndex("by_template", (q) => q.eq("templateId", args.id))
      .first();

    if (tasksUsingTemplate) {
      throw new Error("Cannot delete template that is in use by tasks");
    }

    await ctx.db.delete(args.id);
  },
});

// Set a template as default
export const setDefault = mutation({
  args: { id: v.id("taskTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) {
      throw new Error("Template not found");
    }

    // Unset current default
    const currentDefault = await ctx.db
      .query("taskTemplates")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .first();

    if (currentDefault && currentDefault._id !== args.id) {
      await ctx.db.patch(currentDefault._id, { isDefault: false });
    }

    // Set new default
    await ctx.db.patch(args.id, {
      isDefault: true,
      updatedAt: Date.now(),
    });
  },
});

// Initialize built-in templates (run once on setup)
export const initializeBuiltins = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const created: string[] = [];

    for (const template of BUILTIN_TEMPLATES) {
      // Check if template already exists
      const existing = await ctx.db
        .query("taskTemplates")
        .withIndex("by_name", (q) => q.eq("name", template.name))
        .first();

      if (!existing) {
        await ctx.db.insert("taskTemplates", {
          name: template.name,
          description: template.description,
          phases: template.phases,
          isDefault: template.isDefault,
          isBuiltin: true,
          createdAt: now,
          updatedAt: now,
        });
        created.push(template.name);
      }
    }

    return { created };
  },
});

// Get template for a task (resolves templateId or returns default)
export const getForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return null;
    }

    if (task.templateId) {
      const template = await ctx.db.get(task.templateId);
      if (template) {
        return template;
      }
    }

    // Fall back to default template
    return await ctx.db
      .query("taskTemplates")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .first();
  },
});

// Check if a phase is included in a template
export const hasPhase = query({
  args: {
    templateId: v.optional(v.id("taskTemplates")),
    phase: taskPhaseValidator,
  },
  handler: async (ctx, args) => {
    let phases: TaskPhase[];

    if (args.templateId) {
      const template = await ctx.db.get(args.templateId);
      if (template) {
        phases = template.phases as TaskPhase[];
      } else {
        // Fall back to default
        const defaultTemplate = await ctx.db
          .query("taskTemplates")
          .withIndex("by_default", (q) => q.eq("isDefault", true))
          .first();
        phases = defaultTemplate?.phases as TaskPhase[] ?? BUILTIN_TEMPLATES[0]!.phases;
      }
    } else {
      // Use default template
      const defaultTemplate = await ctx.db
        .query("taskTemplates")
        .withIndex("by_default", (q) => q.eq("isDefault", true))
        .first();
      phases = defaultTemplate?.phases as TaskPhase[] ?? BUILTIN_TEMPLATES[0]!.phases;
    }

    return phases.includes(args.phase as TaskPhase);
  },
});

