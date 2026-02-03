/**
 * Task Execution Orchestrator
 *
 * Orchestrates task phase execution across containers.
 * Connects task phases to container execution with proper prompts.
 */

import type { ExecStartPayload } from "@agent-manager/agent-shared"
import { ConvexHttpClient } from "convex/browser"
import type { ConnectionManager } from "./connections"
import {
	generatePhasePrompt,
	getPhaseDefaults,
	type TaskContext,
	type TaskPhase,
} from "./phase-prompts"

export interface TaskInfo {
	_id: string
	title: string
	description: string
	prompt?: string
	currentPhase?: string
	projectId: string
	acceptanceCriteria?: Array<{ text: string; completed: boolean }>
	tests?: Array<{ name: string; command?: string }>
}

export interface ProjectInfo {
	_id: string
	name: string
	repo: string
	branch: string
}

export interface PhaseExecutionOptions {
	/** Task ID */
	taskId: string
	/** Phase to execute */
	phase: TaskPhase
	/** Container ID to use (optional - will find available if not specified) */
	containerId?: string
	/** Override the prompt config */
	configOverrides?: Partial<ExecStartPayload>
	/** Custom prompt message (overrides generated prompt) */
	customPrompt?: string
}

export interface PhaseExecutionResult {
	success: boolean
	correlationId?: string
	containerId?: string
	error?: string
}

/**
 * Orchestrates task execution across containers
 */
export class TaskOrchestrator {
	private client: ConvexHttpClient
	private connections: ConnectionManager
	private activeExecutions: Map<
		string,
		{
			containerId: string
			taskId: string
			projectId: string
			phase: TaskPhase
			startedAt: number
		}
	>

	constructor(convexUrl: string, connections: ConnectionManager) {
		this.client = new ConvexHttpClient(convexUrl)
		this.connections = connections
		this.activeExecutions = new Map()
	}

	/**
	 * Start execution of a task phase
	 */
	async startPhaseExecution(
		options: PhaseExecutionOptions,
	): Promise<PhaseExecutionResult> {
		const { taskId, phase, containerId, configOverrides, customPrompt } =
			options

		try {
			// Fetch task details from Convex
			const task = await this.fetchTask(taskId)
			if (!task) {
				return { success: false, error: `Task not found: ${taskId}` }
			}

			// Fetch project details
			const project = await this.fetchProject(task.projectId)
			if (!project) {
				return { success: false, error: `Project not found: ${task.projectId}` }
			}

			// Find or validate container
			let targetContainerId = containerId
			if (!targetContainerId) {
				const available = this.connections.findAvailableContainer()
				if (!available) {
					return { success: false, error: "No available containers" }
				}
				targetContainerId = available.info.containerId
			} else {
				const container = this.connections.getContainer(targetContainerId)
				if (!container) {
					return {
						success: false,
						error: `Container not found: ${targetContainerId}`,
					}
				}
			}

			// Build task context for prompt generation
			const context: TaskContext = {
				title: task.title,
				description: task.description,
				prompt: task.prompt,
				repo: project.repo,
				branch: project.branch,
				acceptanceCriteria: task.acceptanceCriteria,
				tests: task.tests,
			}

			// Add phase-specific context
			await this.enrichContextForPhase(context, task, phase)

			// Generate prompt
			const generated = customPrompt
				? { message: customPrompt, config: getPhaseDefaults(phase) }
				: generatePhasePrompt(phase, context)

			// Build exec payload
			const execPayload: ExecStartPayload = {
				message: generated.message,
				model: generated.config.model,
				permissionMode: generated.config.permissionMode,
				maxBudget: generated.config.maxBudget,
				systemPrompt: generated.config.systemPrompt,
				appendSystemPrompt: generated.config.appendSystemPrompt,
				allowedTools: generated.config.allowedTools,
				disallowedTools: generated.config.disallowedTools,
				workingDirectory: "/workspace",
				taskId,
				projectId: task.projectId,
				...configOverrides,
			}

			if (phaseConfig?.provider) {
				execPayload.providerId = phaseConfig.provider
			}
			if (phaseConfig?.model) {
				execPayload.modelId = phaseConfig.model
			}

			if (generated.config.providerId) {
				execPayload.providerId = generated.config.providerId
			}
			if (generated.config.modelId) {
				execPayload.modelId = generated.config.modelId
			}

			// Generate correlation ID
			const correlationId = crypto.randomUUID()

			// Update task phase to in_progress in Convex
			await this.updatePhaseStatus(taskId, phase, "in_progress", {
				containerId: targetContainerId,
				agentSessionId: correlationId,
			})

			// Track the execution
			this.activeExecutions.set(correlationId, {
				containerId: targetContainerId,
				taskId,
				projectId: task.projectId,
				phase,
				startedAt: Date.now(),
			})

			// Send to container
			const sent = this.connections.sendToContainer(
				targetContainerId,
				"exec:start",
				execPayload,
				correlationId,
			)

			if (!sent) {
				this.activeExecutions.delete(correlationId)
				await this.updatePhaseStatus(taskId, phase, "failed", {
					error: "Failed to send to container",
				})
				return {
					success: false,
					error: "Failed to send execution to container",
				}
			}

			console.log(
				`[orchestrator] Started phase ${phase} for task ${taskId} on container ${targetContainerId}`,
			)

			return {
				success: true,
				correlationId,
				containerId: targetContainerId,
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.error(`[orchestrator] Failed to start phase execution:`, error)
			return { success: false, error: message }
		}
	}

	/**
	 * Handle execution completion
	 */
	async handleExecutionComplete(
		correlationId: string,
		result: "success" | "error" | "aborted",
		details?: {
			totalCostUsd?: number
			numTurns?: number
			error?: string
		},
	): Promise<void> {
		const execution = this.activeExecutions.get(correlationId)
		if (!execution) {
			console.warn(
				`[orchestrator] No active execution found for ${correlationId}`,
			)
			return
		}

		const { taskId, phase } = execution

		try {
			if (result === "success") {
				await this.updatePhaseStatus(taskId, phase, "completed", {
					totalCostUsd: details?.totalCostUsd,
					numTurns: details?.numTurns,
				})
			} else {
				await this.updatePhaseStatus(taskId, phase, "failed", {
					error: details?.error || `Execution ${result}`,
					totalCostUsd: details?.totalCostUsd,
					numTurns: details?.numTurns,
				})
			}
		} catch (error) {
			console.error(`[orchestrator] Failed to update phase status:`, error)
		}

		this.activeExecutions.delete(correlationId)
	}

	/**
	 * Get execution info by correlation ID
	 */
	getExecution(correlationId: string) {
		return this.activeExecutions.get(correlationId)
	}

	/**
	 * Get all active executions
	 */
	getActiveExecutions() {
		return Array.from(this.activeExecutions.entries()).map(([id, exec]) => ({
			correlationId: id,
			...exec,
		}))
	}

	/**
	 * Fetch task from Convex
	 */
	private async fetchTask(taskId: string): Promise<TaskInfo | null> {
		try {
			// @ts-expect-error - API types will be generated
			return await this.client.query("tasks:get", { id: taskId })
		} catch (error) {
			console.error(`[orchestrator] Failed to fetch task:`, error)
			return null
		}
	}

	/**
	 * Fetch project from Convex
	 */
	private async fetchProject(projectId: string): Promise<ProjectInfo | null> {
		try {
			// @ts-expect-error - API types will be generated
			return await this.client.query("projects:get", { id: projectId })
		} catch (error) {
			console.error(`[orchestrator] Failed to fetch project:`, error)
			return null
		}
	}

	/**
	 * Update task phase status in Convex
	 */
	private async updatePhaseStatus(
		taskId: string,
		phase: TaskPhase,
		status: "in_progress" | "completed" | "failed",
		data?: {
			containerId?: string
			agentSessionId?: string
			totalCostUsd?: number
			numTurns?: number
			error?: string
		},
	): Promise<void> {
		try {
			const mutation =
				status === "in_progress"
					? "taskPhases:startPhase"
					: status === "completed"
						? "taskPhases:completePhase"
						: "taskPhases:failPhase"

			// @ts-expect-error - API types will be generated
			await this.client.mutation(mutation, {
				taskId,
				phase,
				...data,
			})
		} catch (error) {
			console.error(`[orchestrator] Failed to update phase status:`, error)
		}
	}

	/**
	 * Enrich context with phase-specific data
	 */
	private async enrichContextForPhase(
		context: TaskContext,
		task: TaskInfo,
		phase: TaskPhase,
	): Promise<void> {
		// For review/remediation/merge phases, fetch PR info
		if (["ai_review", "remediation", "human_review", "merge"].includes(phase)) {
			try {
				// @ts-expect-error - API types will be generated
				const pr = await this.client.query("pullRequests:getByTask", {
					taskId: task._id,
				})
				if (pr) {
					context.pullRequest = {
						number: pr.number,
						url: pr.url,
						branch: pr.headBranch,
					}
				}
			} catch (error) {
				console.warn(`[orchestrator] Failed to fetch PR info:`, error)
			}
		}

		// For remediation phase, fetch issues
		if (phase === "remediation") {
			try {
				// @ts-expect-error - API types will be generated
				const issues = await this.client.query("prIssues:listByTask", {
					taskId: task._id,
				})
				if (issues && issues.length > 0) {
					context.issues = issues.map(
						(issue: {
							title: string
							description: string
							severity: string
							filePath?: string
							lineNumber?: number
						}) => ({
							title: issue.title,
							description: issue.description,
							severity: issue.severity,
							filePath: issue.filePath,
							lineNumber: issue.lineNumber,
						}),
					)
				}
			} catch (error) {
				console.warn(`[orchestrator] Failed to fetch PR issues:`, error)
			}
		}

		// For implementation phase, try to get planning output
		if (phase === "implementation") {
			try {
				// @ts-expect-error - API types will be generated
				const planningPhase = await this.client.query("taskPhases:getPhase", {
					taskId: task._id,
					phase: "planning",
				})
				if (planningPhase?.result) {
					context.planningOutput = planningPhase.result
				}
			} catch (error) {
				console.warn(`[orchestrator] Failed to fetch planning output:`, error)
			}
		}
	}
}
