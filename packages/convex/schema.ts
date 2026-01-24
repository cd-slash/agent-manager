import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import {
	agentMessageTypeValidator,
	aiProviderTypeValidator,
	authTypeValidator,
	commandPriorityValidator,
	containerCommandTypeValidator,
	containerPoolStatusValidator,
	containerTypeValidator,
	gatewayCommandStatusValidator,
	phaseStatusValidator,
	prDetectedViaValidator,
	remediationTriggerValidator,
	serverCommandTypeValidator,
	taskPhaseValidator,
} from "./validators"

export default defineSchema({
	// Settings table - global app settings (credentials, config)
	settings: defineTable({
		key: v.string(),
		value: v.any(),
		lastValidated: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_key", ["key"]),

	// Projects table - project metadata and plan
	projects: defineTable({
		name: v.string(),
		description: v.string(),
		plan: v.optional(v.string()),
		// Repository configuration for container creation
		repo: v.optional(v.string()), // GitHub repo in format "owner/repo"
		branch: v.optional(v.string()), // Default branch (e.g., "main")
		archived: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_archived", ["archived"])
		.index("by_name", ["name"]),

	// Task templates - define custom phase flows for different task types
	taskTemplates: defineTable({
		name: v.string(), // e.g., "Standard", "Quick Fix", "Auto Merge"
		description: v.string(),
		phases: v.array(taskPhaseValidator), // Ordered list of phases to use
		isDefault: v.boolean(), // If true, this is the default template for new tasks
		isBuiltin: v.boolean(), // If true, this is a system-provided template
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_name", ["name"])
		.index("by_default", ["isDefault"]),

	// Tasks table - tasks with status, PR info
	tasks: defineTable({
		projectId: v.id("projects"),
		templateId: v.optional(v.id("taskTemplates")), // Which template this task uses
		title: v.string(),
		description: v.string(),
		prompt: v.optional(v.string()),
		category: v.union(
			v.literal("backlog"),
			v.literal("todo"),
			v.literal("in-progress"),
			v.literal("done"),
		),
		tag: v.string(),
		complexity: v.string(),
		order: v.number(), // For ordering within a category
		// Phase tracking
		currentPhase: v.optional(taskPhaseValidator),
		phaseUpdatedAt: v.optional(v.number()),
		activeContainerId: v.optional(v.string()),
		// Planning outputs
		implementationPrompt: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_project", ["projectId"])
		.index("by_project_and_category", ["projectId", "category"])
		.index("by_current_phase", ["currentPhase"])
		.index("by_template", ["templateId"]),

	// Task dependencies - many-to-many relationship
	taskDependencies: defineTable({
		taskId: v.id("tasks"),
		dependsOnTaskId: v.id("tasks"),
	})
		.index("by_task", ["taskId"])
		.index("by_depends_on", ["dependsOnTaskId"]),

	// Acceptance criteria - checklist items per task
	acceptanceCriteria: defineTable({
		taskId: v.id("tasks"),
		text: v.string(),
		done: v.boolean(),
		order: v.number(),
	}).index("by_task", ["taskId"]),

	// Tests - test results per task
	tests: defineTable({
		taskId: v.id("tasks"),
		name: v.string(),
		status: v.union(
			v.literal("passed"),
			v.literal("pending"),
			v.literal("failed"),
		),
		output: v.optional(v.string()),
		duration: v.optional(v.number()), // in milliseconds
		runAt: v.optional(v.number()),
	})
		.index("by_task", ["taskId"])
		.index("by_task_and_status", ["taskId", "status"]),

	// Chat messages - AI/user messages (project or task level)
	chatMessages: defineTable({
		projectId: v.optional(v.id("projects")),
		taskId: v.optional(v.id("tasks")),
		sender: v.union(v.literal("ai"), v.literal("user")),
		text: v.string(),
		createdAt: v.number(),
	})
		.index("by_project", ["projectId"])
		.index("by_task", ["taskId"]),

	// History events - audit trail
	historyEvents: defineTable({
		projectId: v.optional(v.id("projects")),
		taskId: v.optional(v.id("tasks")),
		action: v.string(),
		user: v.string(),
		metadata: v.optional(v.any()),
		createdAt: v.number(),
	})
		.index("by_project", ["projectId"])
		.index("by_task", ["taskId"]),

	// Pull requests - PR metadata, review status
	pullRequests: defineTable({
		taskId: v.id("tasks"),
		prNumber: v.number(),
		title: v.string(),
		description: v.optional(v.string()),
		branch: v.string(),
		baseBranch: v.string(),
		status: v.union(
			v.literal("draft"),
			v.literal("open"),
			v.literal("review_requested"),
			v.literal("changes_requested"),
			v.literal("approved"),
			v.literal("merged"),
			v.literal("closed"),
		),
		url: v.optional(v.string()),
		detectedVia: v.optional(prDetectedViaValidator),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_task", ["taskId"])
		.index("by_status", ["status"])
		.index("by_branch", ["branch"]),

	// PR comments - comments on PRs
	prComments: defineTable({
		pullRequestId: v.id("pullRequests"),
		author: v.string(),
		body: v.string(),
		filePath: v.optional(v.string()),
		lineNumber: v.optional(v.number()),
		resolved: v.boolean(),
		createdAt: v.number(),
	}).index("by_pull_request", ["pullRequestId"]),

	// PR issues - AI-detected code issues
	prIssues: defineTable({
		pullRequestId: v.id("pullRequests"),
		severity: v.union(
			v.literal("error"),
			v.literal("warning"),
			v.literal("info"),
		),
		title: v.string(),
		description: v.string(),
		filePath: v.string(),
		lineNumber: v.optional(v.number()),
		suggestion: v.optional(v.string()),
		resolved: v.boolean(),
		createdAt: v.number(),
	}).index("by_pull_request", ["pullRequestId"]),

	// PR checks - CI/CD check results
	prChecks: defineTable({
		pullRequestId: v.id("pullRequests"),
		name: v.string(),
		status: v.union(
			v.literal("pending"),
			v.literal("running"),
			v.literal("passed"),
			v.literal("failed"),
			v.literal("skipped"),
		),
		url: v.optional(v.string()),
		output: v.optional(v.string()),
		startedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
	}).index("by_pull_request", ["pullRequestId"]),

	// Servers - server infrastructure
	servers: defineTable({
		name: v.string(),
		ip: v.string(),
		region: v.string(),
		status: v.union(
			v.literal("online"),
			v.literal("maintenance"),
			v.literal("offline"),
		),
		cpu: v.number(), // percentage 0-100
		mem: v.number(), // percentage 0-100
		// SSH connection settings
		sshUser: v.optional(v.string()), // SSH username (default: root)
		// Tailscale integration fields
		tailscaleNodeId: v.optional(v.string()),
		tailscaleHostname: v.optional(v.string()),
		tailscaleTags: v.optional(v.array(v.string())),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_status", ["status"])
		.index("by_region", ["region"])
		.index("by_tailscale_node_id", ["tailscaleNodeId"]),

	// Containers - Docker containers (also used for Tailscale code-agent devices)
	containers: defineTable({
		serverId: v.optional(v.id("servers")), // Optional for Tailscale-managed containers
		containerId: v.string(), // Docker container ID
		name: v.string(),
		image: v.string(),
		status: v.union(
			v.literal("running"),
			v.literal("stopped"),
			v.literal("restarting"),
			v.literal("paused"),
			v.literal("exited"),
		),
		port: v.string(),
		// Container type - "agent" for task execution, "management" for auth/admin
		containerType: v.optional(containerTypeValidator), // Optional for backward compat, defaults to "agent"
		// Server hostname for containers without serverId (e.g., agent-gateway created)
		serverHostname: v.optional(v.string()),
		// Tailscale integration fields
		tailscaleNodeId: v.optional(v.string()),
		tailscaleHostname: v.optional(v.string()),
		tailscaleTags: v.optional(v.array(v.string())),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_server", ["serverId"])
		.index("by_status", ["status"])
		.index("by_tailscale_node_id", ["tailscaleNodeId"])
		.index("by_container_type", ["containerType"]),

	// Server metrics - time-series metrics
	serverMetrics: defineTable({
		serverId: v.id("servers"),
		cpu: v.number(),
		mem: v.number(),
		networkIn: v.optional(v.number()),
		networkOut: v.optional(v.number()),
		diskUsage: v.optional(v.number()),
		timestamp: v.number(),
	}).index("by_server_and_timestamp", ["serverId", "timestamp"]),

	// Webhook events - incoming webhook storage
	webhookEvents: defineTable({
		source: v.union(
			v.literal("github"),
			v.literal("cicd"),
			v.literal("agent"),
			v.literal("tailscale"),
		),
		eventType: v.string(),
		payload: v.any(),
		status: v.union(
			v.literal("pending"),
			v.literal("processing"),
			v.literal("processed"),
			v.literal("failed"),
		),
		errorMessage: v.optional(v.string()),
		processedAt: v.optional(v.number()),
		retryCount: v.number(),
		createdAt: v.number(),
	}).index("by_source_and_status", ["source", "status"]),

	// Agent jobs - AI job tracking
	agentJobs: defineTable({
		taskId: v.optional(v.id("tasks")),
		pullRequestId: v.optional(v.id("pullRequests")),
		type: v.union(
			v.literal("chat_response"),
			v.literal("task_analysis"),
			v.literal("code_review"),
			v.literal("auto_fix"),
		),
		status: v.union(
			v.literal("pending"),
			v.literal("running"),
			v.literal("completed"),
			v.literal("failed"),
		),
		input: v.optional(v.any()),
		output: v.optional(v.any()),
		errorMessage: v.optional(v.string()),
		startedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_task", ["taskId"])
		.index("by_status", ["status"]),

	// Agent sessions - Claude Code CLI sessions via agent-gateway
	agentSessions: defineTable({
		sessionId: v.string(), // UUID from gateway
		containerId: v.string(), // Container running the session
		taskId: v.optional(v.id("tasks")),
		projectId: v.optional(v.id("projects")),
		prompt: v.string(), // Initial prompt sent to CLI
		status: v.union(
			v.literal("starting"),
			v.literal("running"),
			v.literal("completed"),
			v.literal("failed"),
			v.literal("cancelled"),
		),
		result: v.optional(v.string()), // Final result text
		error: v.optional(v.string()), // Error message if failed
		totalCostUsd: v.optional(v.number()),
		numTurns: v.optional(v.number()),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
	})
		.index("by_session_id", ["sessionId"])
		.index("by_container", ["containerId"])
		.index("by_task", ["taskId"])
		.index("by_project", ["projectId"])
		.index("by_status", ["status"]),

	// Agent messages - streaming output from Claude Code CLI
	// Stores structured content for rich display and analysis
	agentMessages: defineTable({
		sessionId: v.string(), // References agentSessions.sessionId

		// Message classification
		messageType: agentMessageTypeValidator,
		streamType: v.optional(v.string()), // Original stream type from CLI (assistant, result, system)

		// Structured content fields
		text: v.optional(v.string()), // Text content for text/thinking/error types
		toolName: v.optional(v.string()), // Tool name for tool_use/tool_result
		toolId: v.optional(v.string()), // Tool call ID for correlation
		toolInput: v.optional(v.any()), // Tool input parameters (JSON object)
		toolResult: v.optional(v.any()), // Tool result data (JSON object)
		isError: v.optional(v.boolean()), // Whether tool result is an error

		// For backward compatibility - raw JSON content
		rawContent: v.optional(v.string()), // Original JSON stringified content

		// Metadata
		timestamp: v.number(),
		sequenceNumber: v.optional(v.number()), // Order within session for streaming
	})
		.index("by_session", ["sessionId"])
		.index("by_session_and_timestamp", ["sessionId", "timestamp"])
		.index("by_session_and_sequence", ["sessionId", "sequenceNumber"])
		.index("by_session_and_type", ["sessionId", "messageType"]),

	// Notifications - notification queue for toast messages
	notifications: defineTable({
		type: v.union(
			v.literal("success"),
			v.literal("error"),
			v.literal("warning"),
			v.literal("info"),
		),
		title: v.string(),
		message: v.optional(v.string()),
		sourceTable: v.optional(v.string()), // e.g., "projects", "tasks", "servers"
		sourceId: v.optional(v.string()), // ID reference to source entity
		read: v.boolean(),
		dismissedAt: v.optional(v.number()),
		createdAt: v.number(),
		expiresAt: v.optional(v.number()), // Auto-cleanup TTL
	})
		.index("by_created", ["createdAt"])
		.index("by_read", ["read"])
		.index("by_read_and_created", ["read", "createdAt"]),

	// Secrets - encrypted secrets for container creation and deployment
	secrets: defineTable({
		key: v.string(),
		value: v.string(),
		description: v.optional(v.string()),
	}).index("by_key", ["key"]),

	// AI Providers - configuration for AI model providers (Anthropic, OpenAI, Google)
	aiProviders: defineTable({
		name: v.string(),
		type: aiProviderTypeValidator,
		enabled: v.boolean(),
		authType: authTypeValidator,
		// API Key auth - references secrets table
		apiKeySecretKey: v.optional(v.string()),
		// OAuth auth - uses existing gateway flow, token stored as ANTHROPIC_AUTH_TOKEN in secrets
		models: v.array(
			v.object({
				id: v.string(),
				name: v.string(),
				enabled: v.boolean(),
			}),
		),
		isBuiltin: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_type", ["type"])
		.index("by_enabled", ["enabled"]),

	// Container builds - top-level build session tracking
	containerBuilds: defineTable({
		containerId: v.string(),
		repo: v.string(),
		branch: v.string(),
		server: v.string(),
		currentPhase: v.string(), // Current phase name
		status: v.union(
			v.literal("pending"),
			v.literal("in_progress"),
			v.literal("completed"),
			v.literal("failed"),
		),
		error: v.optional(v.string()),
		taskId: v.optional(v.id("tasks")),
		projectId: v.optional(v.id("projects")),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
	})
		.index("by_container", ["containerId"])
		.index("by_status", ["status"]),

	// Container build phases - individual phase tracking with logs
	containerBuildPhases: defineTable({
		containerId: v.string(),
		phase: v.string(),
		status: v.union(
			v.literal("pending"),
			v.literal("in_progress"),
			v.literal("completed"),
			v.literal("failed"),
			v.literal("skipped"),
		),
		logs: v.optional(v.string()),
		error: v.optional(v.string()),
		startedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
		order: v.number(),
	})
		.index("by_container", ["containerId"])
		.index("by_container_and_order", ["containerId", "order"]),

	// Task phases - track individual phase executions for each task
	taskPhases: defineTable({
		taskId: v.id("tasks"),
		phase: taskPhaseValidator,
		status: phaseStatusValidator,
		startedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
		// Agent configuration used
		provider: v.optional(v.string()),
		model: v.optional(v.string()),
		prompt: v.optional(v.string()),
		permissionMode: v.optional(v.string()),
		// Results
		result: v.optional(v.string()),
		error: v.optional(v.string()),
		// References
		agentSessionId: v.optional(v.string()),
		containerId: v.optional(v.string()),
		// Cost tracking
		totalCostUsd: v.optional(v.number()),
		numTurns: v.optional(v.number()),
		order: v.number(),
		// Remediation tracking (for remediation phase only)
		currentRemediationCycle: v.optional(v.number()),
		remediationTriggeredBy: v.optional(remediationTriggerValidator),
	})
		.index("by_task", ["taskId"])
		.index("by_task_and_phase", ["taskId", "phase"])
		.index("by_status", ["status"]),

	// Remediation cycles - track individual remediation cycle executions
	remediationCycles: defineTable({
		taskId: v.id("tasks"),
		cycleNumber: v.number(), // 1-indexed
		triggeredBy: remediationTriggerValidator, // Which review phase triggered this cycle
		feedback: v.optional(v.string()), // Human's feedback when they request changes
		status: phaseStatusValidator,
		startedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
		// Agent configuration used
		provider: v.optional(v.string()),
		model: v.optional(v.string()),
		prompt: v.optional(v.string()),
		permissionMode: v.optional(v.string()),
		// Results
		result: v.optional(v.string()),
		error: v.optional(v.string()),
		// References
		agentSessionId: v.optional(v.string()),
		containerId: v.optional(v.string()),
		// Cost tracking
		totalCostUsd: v.optional(v.number()),
		numTurns: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_task", ["taskId"])
		.index("by_task_and_cycle", ["taskId", "cycleNumber"])
		.index("by_status", ["status"]),

	// OAuth flows - track OAuth flow requests for gateway processing
	// Frontend creates a flow, gateway processes it, updates with results
	oauthFlows: defineTable({
		provider: v.string(), // "anthropic", "openai", etc.
		status: v.union(
			v.literal("pending"), // Waiting for gateway to process
			v.literal("started"), // Gateway initiated OAuth, has URL
			v.literal("code_received"), // User submitted auth code
			v.literal("completing"), // Gateway is exchanging code for token
			v.literal("completed"), // Successfully got token
			v.literal("failed"), // Error occurred
		),
		// Set by gateway when it starts the flow
		oauthUrl: v.optional(v.string()),
		flowId: v.optional(v.string()), // Gateway's internal flow ID
		expiresAt: v.optional(v.number()),
		// Set by frontend when user submits code
		authCode: v.optional(v.string()),
		// Set by gateway on completion
		error: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_status", ["status"])
		.index("by_provider_and_status", ["provider", "status"]),

	// Phase configs - store default and per-task agent configurations
	phaseConfigs: defineTable({
		taskId: v.optional(v.id("tasks")), // null = global default
		phase: taskPhaseValidator,
		provider: v.string(),
		model: v.string(),
		permissionMode: v.string(),
		promptTemplate: v.string(),
		systemPrompt: v.optional(v.string()),
		maxBudgetUsd: v.optional(v.number()),
		maxRemediationCycles: v.optional(v.number()), // Limit on remediation cycles (default: 3)
		enabled: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_phase", ["phase"])
		.index("by_task_and_phase", ["taskId", "phase"]),

	// Server commands - queued work for the gateway to process via SSH/Docker
	// These are infrastructure operations, NOT sent to containers
	// Frontend creates commands, gateway subscribes and processes them
	serverCommands: defineTable({
		// Command type: createContainer, stopContainer, deleteContainer
		type: serverCommandTypeValidator,

		// Status tracks command lifecycle: pending -> processing -> completed/failed
		status: gatewayCommandStatusValidator,

		// Priority for queue ordering (higher = more urgent)
		priority: commandPriorityValidator,

		// Payload contains type-specific parameters:
		// createContainer: { repo?, branch?, name?, server?, sshUser?, taskId?, projectId? }
		// stopContainer: { containerName, server, sshUser? }
		// deleteContainer: { containerName, server, sshUser? }
		payload: v.any(),

		// Result set by gateway on completion
		result: v.optional(v.any()),

		// Error message if command failed
		error: v.optional(v.string()),

		// For task-related commands
		taskId: v.optional(v.string()),
		projectId: v.optional(v.string()),

		// Retry handling
		retryCount: v.number(),
		maxRetries: v.number(),
		lastError: v.optional(v.string()),

		// Timestamps
		createdAt: v.number(),
		updatedAt: v.number(),
		processedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
	})
		.index("by_status", ["status"])
		.index("by_type_and_status", ["type", "status"])
		.index("by_priority_and_status", ["priority", "status"])
		.index("by_task", ["taskId"]),

	// Container commands - work items targeted at specific containers
	// Each container subscribes to its own queue via containerId
	containerCommands: defineTable({
		// Target container - REQUIRED, each container only sees its own commands
		containerId: v.string(),

		// Command type determines what operation to perform
		type: containerCommandTypeValidator,

		// Status: pending -> processing -> completed/failed
		status: gatewayCommandStatusValidator,

		// Priority for ordering
		priority: commandPriorityValidator,

		// Payload contains type-specific parameters:
		// startExecution: { message, model?, workingDirectory?, permissionMode?, ... }
		// abortExecution: { correlationId }
		// pushAuthToken: { token }
		// startPhaseExecution: { taskId, phase, customPrompt?, configOverrides? }
		// startOAuthFlow: { provider, oauthFlowId }
		// completeOAuthFlow: { oauthFlowId, authCode }
		payload: v.any(),

		// Result set by container on completion
		result: v.optional(v.any()),

		// Error message if command failed
		error: v.optional(v.string()),

		// For execution commands - correlation ID for tracking streams
		correlationId: v.optional(v.string()),

		// For task-related commands
		taskId: v.optional(v.string()),
		projectId: v.optional(v.string()),

		// Retry handling
		retryCount: v.number(),
		maxRetries: v.number(),
		lastError: v.optional(v.string()),

		// Timestamps
		createdAt: v.number(),
		updatedAt: v.number(),
		processedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
	})
		.index("by_container", ["containerId"])
		.index("by_container_and_status", ["containerId", "status"])
		.index("by_status", ["status"])
		.index("by_correlation_id", ["correlationId"])
		.index("by_task", ["taskId"]),

	// Container pool - tracks container availability for execution commands
	// Gateway maintains this based on container connections and execution state
	containerPool: defineTable({
		containerId: v.string(), // Container identifier
		hostname: v.string(), // Tailscale/network hostname

		// Availability status
		status: containerPoolStatusValidator,

		// Current work assignment
		currentSessionId: v.optional(v.string()), // Active session correlation ID
		currentCommandId: v.optional(v.id("containerCommands")), // Command being executed
		reservedForTaskId: v.optional(v.string()), // If reserved for a specific task

		// Capacity and health
		capabilities: v.optional(v.array(v.string())), // Container capabilities
		maxConcurrent: v.number(), // Max concurrent executions (usually 1)
		currentLoad: v.number(), // Current number of executions

		// Timestamps
		connectedAt: v.number(),
		lastActivityAt: v.number(),
		lastHealthCheck: v.optional(v.number()),
	})
		.index("by_container_id", ["containerId"])
		.index("by_status", ["status"])
		.index("by_status_and_activity", ["status", "lastActivityAt"]),

})
