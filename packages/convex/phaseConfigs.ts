import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { taskPhaseValidator, permissionModeValidator } from "./validators";

// Default prompt templates for each phase
const DEFAULT_PROMPTS = {
  planning: `You are a planning agent. Analyze this task and prepare it for implementation.

Task: {{task.title}}
Description: {{task.description}}

Your job is to:
1. Create detailed acceptance criteria that define when this task is complete
2. Write the implementation prompt that will be given to the implementation agent
3. Define test cases that should pass when the implementation is complete

Output structured JSON with:
- acceptanceCriteria: array of criteria strings
- implementationPrompt: the full prompt for the implementation agent
- testCases: array of test definitions with name, description, and expected outcome`,

  implementation: `You are an implementation agent. Complete this coding task.

Task: {{task.title}}
{{task.implementationPrompt}}

Acceptance Criteria:
{{#each task.acceptanceCriteria}}
- {{this}}
{{/each}}

Requirements:
1. Write clean, well-tested code following project conventions
2. Create a feature branch: task-{{task.id}}
3. Make atomic commits with clear messages
4. Run tests to verify acceptance criteria are met
5. Create a pull request when complete with a clear description

When the PR is created, your work is complete.`,

  ai_review: `You are a code review agent. Review this pull request thoroughly.

Task: {{task.title}}
Pull Request: #{{pr.number}}
Branch: {{pr.branch}} → {{pr.baseBranch}}

Review the code for:
1. Correctness - does it meet the acceptance criteria?
2. Code quality - is it clean, readable, maintainable?
3. Security - any vulnerabilities or unsafe patterns?
4. Performance - any obvious performance issues?
5. Test coverage - are the tests adequate?

Provide specific feedback with file paths and line numbers.
If issues are found, leave review comments on the PR.
Approve or request changes based on your findings.`,

  remediation: `You are a remediation agent. Fix the issues identified during code review.

Task: {{task.title}}
Pull Request: #{{pr.number}}
Remediation Cycle: {{remediation.cycleNumber}} of {{remediation.maxCycles}}
Triggered By: {{remediation.triggeredBy}}

{{#if remediation.feedback}}
Human Feedback:
{{remediation.feedback}}
{{/if}}

{{#if remediation.aiReviewIssues}}
AI Review Issues:
{{#each remediation.aiReviewIssues}}
- {{this.file}}:{{this.line}} - {{this.issue}}
{{/each}}
{{/if}}

Your job is to:
1. Address each issue identified in the review
2. Make the necessary code changes
3. Ensure tests still pass after your changes
4. Commit your fixes with clear messages

Once you have addressed all issues, your work is complete.
The changes will be re-reviewed by the AI review agent for validation.`,

  human_review: `You are a review assistant helping a human reviewer evaluate this PR.

Task: {{task.title}}
Pull Request: #{{pr.number}}
Preview URL: {{deployment.previewUrl}}

The human reviewer may ask you questions about the code changes.
Help them by:
1. Explaining what the code does
2. Highlighting any concerns from the AI review
3. Suggesting things to test in the preview deployment
4. Answering technical questions about the implementation

Be helpful and concise. The human makes the final approval decision.`,

  merge: `You are a merge agent. Merge this approved pull request.

Task: {{task.title}}
Pull Request: #{{pr.number}}

Steps:
1. Verify all required reviews are approved
2. Verify all CI checks are passing
3. Check for merge conflicts with main
4. If conflicts exist, resolve them preserving the intent of both changes
5. Perform squash merge with a clear commit message
6. Verify the merge was successful
7. Delete the feature branch

Report success or any issues encountered.`,
} as const;

// Default configuration for each phase
const DEFAULT_CONFIGS = {
  planning: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    permissionMode: "plan",
  },
  implementation: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    permissionMode: "accept_edits",
  },
  ai_review: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    permissionMode: "default",
  },
  remediation: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    permissionMode: "accept_edits",
  },
  human_review: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    permissionMode: "default",
  },
  merge: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    permissionMode: "accept_edits",
  },
} as const;

// Phases that have agent configurations (excludes requirements which is human-defined)
export const AGENT_PHASES = ["planning", "implementation", "ai_review", "remediation", "human_review", "merge"] as const;
export type AgentPhase = (typeof AGENT_PHASES)[number];

// Get all global default configs
export const getAllDefaults = query({
  args: {},
  handler: async (ctx) => {
    const configs = await ctx.db
      .query("phaseConfigs")
      .filter((q) => q.eq(q.field("taskId"), undefined))
      .collect();

    // Return as a map for easy access
    const configMap: Record<string, typeof configs[0]> = {};
    for (const config of configs) {
      configMap[config.phase] = config;
    }
    return configMap;
  },
});

// Get default config for a specific phase
export const getDefaultConfig = query({
  args: { phase: taskPhaseValidator },
  handler: async (ctx, args) => {
    // Requirements phase doesn't have agent config
    if (args.phase === "requirements") {
      return null;
    }

    return await ctx.db
      .query("phaseConfigs")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", undefined).eq("phase", args.phase)
      )
      .first();
  },
});

// Get task-specific override for a phase
export const getTaskOverride = query({
  args: {
    taskId: v.id("tasks"),
    phase: taskPhaseValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("phaseConfigs")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", args.taskId).eq("phase", args.phase)
      )
      .first();
  },
});

// Get effective config (task override or default) for a phase
export const getEffectiveConfig = query({
  args: {
    taskId: v.id("tasks"),
    phase: taskPhaseValidator,
  },
  handler: async (ctx, args) => {
    // Requirements phase doesn't have agent config
    if (args.phase === "requirements") {
      return null;
    }

    // First check for task-specific override
    const taskConfig = await ctx.db
      .query("phaseConfigs")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", args.taskId).eq("phase", args.phase)
      )
      .first();

    if (taskConfig) {
      return { ...taskConfig, isOverride: true };
    }

    // Fall back to global default
    const defaultConfig = await ctx.db
      .query("phaseConfigs")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", undefined).eq("phase", args.phase)
      )
      .first();

    if (defaultConfig) {
      return { ...defaultConfig, isOverride: false };
    }

    // Return built-in default if no config exists in DB
    const phase = args.phase as AgentPhase;
    const builtinConfig = DEFAULT_CONFIGS[phase];
    const builtinPrompt = DEFAULT_PROMPTS[phase];

    return {
      _id: null,
      taskId: undefined,
      phase: args.phase,
      provider: builtinConfig.provider,
      model: builtinConfig.model,
      permissionMode: builtinConfig.permissionMode,
      promptTemplate: builtinPrompt,
      systemPrompt: undefined,
      maxBudgetUsd: undefined,
      enabled: true,
      isOverride: false,
      isBuiltin: true,
    };
  },
});

// Get all configs for a task (defaults + overrides)
export const getAllConfigsForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const configs: Record<string, unknown> = {};

    for (const phase of AGENT_PHASES) {
      // Check for task-specific override
      const taskConfig = await ctx.db
        .query("phaseConfigs")
        .withIndex("by_task_and_phase", (q) =>
          q.eq("taskId", args.taskId).eq("phase", phase)
        )
        .first();

      if (taskConfig) {
        configs[phase] = { ...taskConfig, isOverride: true };
        continue;
      }

      // Fall back to global default
      const defaultConfig = await ctx.db
        .query("phaseConfigs")
        .withIndex("by_task_and_phase", (q) =>
          q.eq("taskId", undefined).eq("phase", phase)
        )
        .first();

      if (defaultConfig) {
        configs[phase] = { ...defaultConfig, isOverride: false };
        continue;
      }

      // Use built-in default
      configs[phase] = {
        _id: null,
        taskId: undefined,
        phase,
        provider: DEFAULT_CONFIGS[phase].provider,
        model: DEFAULT_CONFIGS[phase].model,
        permissionMode: DEFAULT_CONFIGS[phase].permissionMode,
        promptTemplate: DEFAULT_PROMPTS[phase],
        systemPrompt: undefined,
        maxBudgetUsd: undefined,
        enabled: true,
        isOverride: false,
        isBuiltin: true,
      };
    }

    return configs;
  },
});

// Upsert a global default config
export const upsertDefault = mutation({
  args: {
    phase: taskPhaseValidator,
    provider: v.string(),
    model: v.string(),
    permissionMode: v.string(),
    promptTemplate: v.string(),
    systemPrompt: v.optional(v.string()),
    maxBudgetUsd: v.optional(v.number()),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { phase, ...config } = args;
    const now = Date.now();

    // Check for existing default
    const existing = await ctx.db
      .query("phaseConfigs")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", undefined).eq("phase", phase)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...config,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new default
    return await ctx.db.insert("phaseConfigs", {
      taskId: undefined,
      phase,
      ...config,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Create or update a task-specific override
export const upsertTaskOverride = mutation({
  args: {
    taskId: v.id("tasks"),
    phase: taskPhaseValidator,
    provider: v.string(),
    model: v.string(),
    permissionMode: v.string(),
    promptTemplate: v.string(),
    systemPrompt: v.optional(v.string()),
    maxBudgetUsd: v.optional(v.number()),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { taskId, phase, ...config } = args;
    const now = Date.now();

    // Check task exists
    const task = await ctx.db.get(taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    // Check for existing override
    const existing = await ctx.db
      .query("phaseConfigs")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", taskId).eq("phase", phase)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...config,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new override
    return await ctx.db.insert("phaseConfigs", {
      taskId,
      phase,
      ...config,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Delete a task-specific override (reverts to default)
export const deleteTaskOverride = mutation({
  args: {
    taskId: v.id("tasks"),
    phase: taskPhaseValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("phaseConfigs")
      .withIndex("by_task_and_phase", (q) =>
        q.eq("taskId", args.taskId).eq("phase", args.phase)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// Initialize default configs for all phases (run once on setup)
export const initializeDefaults = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    for (const phase of AGENT_PHASES) {
      // Check if default already exists
      const existing = await ctx.db
        .query("phaseConfigs")
        .withIndex("by_task_and_phase", (q) =>
          q.eq("taskId", undefined).eq("phase", phase)
        )
        .first();

      if (!existing) {
        await ctx.db.insert("phaseConfigs", {
          taskId: undefined,
          phase,
          provider: DEFAULT_CONFIGS[phase].provider,
          model: DEFAULT_CONFIGS[phase].model,
          permissionMode: DEFAULT_CONFIGS[phase].permissionMode,
          promptTemplate: DEFAULT_PROMPTS[phase],
          enabled: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

// Get the built-in default prompt for a phase
export const getBuiltinPrompt = query({
  args: { phase: taskPhaseValidator },
  handler: async (_ctx, args) => {
    if (args.phase === "requirements") {
      return null;
    }
    return DEFAULT_PROMPTS[args.phase as AgentPhase];
  },
});

// Get all built-in defaults (for reference/reset)
export const getBuiltinDefaults = query({
  args: {},
  handler: async () => {
    return {
      configs: DEFAULT_CONFIGS,
      prompts: DEFAULT_PROMPTS,
    };
  },
});
