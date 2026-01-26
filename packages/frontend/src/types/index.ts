// Convex types - these will be available after running `bunx convex dev`
// Import from the generated data model when available
// import { Id, Doc } from "../../convex/_generated/dataModel";

// Placeholder types until Convex is deployed
// Replace these with actual imports from convex/_generated/dataModel after setup
type Id<T extends string> = string & { __tableName: T }
type Doc<T extends string> = { _id: Id<T>; _creationTime: number } & Record<
	string,
	unknown
>

// AI Provider types
export type AiProviderType = "anthropic" | "openai" | "google" | "zai" | "custom"
export type AuthType = "api_key" | "oauth"

export interface AiModelConfig {
	id: string
	name: string
	enabled: boolean
}

export type AiProviderDoc = Doc<"aiProviders"> & {
	name: string
	type: AiProviderType
	enabled: boolean
	authType: AuthType
	apiKeySecretKey?: string
	models: AiModelConfig[]
	isBuiltin: boolean
	createdAt: number
	updatedAt: number
}

export interface EnabledModel {
	id: string
	name: string
	providerId: string
	providerName: string
	providerType: AiProviderType
}

export interface EnabledModelsGrouped {
	providerId: string
	providerName: string
	providerType: AiProviderType
	models: Array<{ id: string; name: string }>
}

// Task phase types (defined early to avoid forward references)
export type TaskPhase =
	| "requirements"
	| "planning"
	| "implementation"
	| "ai_review"
	| "remediation"
	| "human_review"
	| "merge"
export type PhaseStatus =
	| "pending"
	| "in_progress"
	| "completed"
	| "failed"
	| "skipped"
export type PermissionMode = "default" | "plan" | "accept_edits" | "full_auto"
export type PrDetectedVia = "webhook" | "agent" | "manual"
export type RemediationTrigger = "ai_review" | "human_review"

// Re-export Convex document types for convenience
export type ProjectDoc = Doc<"projects"> & {
	name: string
	description: string
	plan?: string
	repo?: string
	branch?: string
	archived: boolean
	createdAt: number
	updatedAt: number
}

export type TaskDoc = Doc<"tasks"> & {
	projectId: Id<"projects">
	title: string
	description: string
	prompt?: string
	category: "backlog" | "todo" | "in-progress" | "done"
	tag: string
	complexity: string
	order: number
	// Phase tracking
	currentPhase?: TaskPhase
	phaseUpdatedAt?: number
	activeContainerId?: string
	// Session tracking for chat resumption (requires same container)
	activeSessionId?: string
	// Template
	templateId?: Id<"taskTemplates">
	// Planning outputs
	implementationPrompt?: string
	createdAt: number
	updatedAt: number
}

export type AcceptanceCriteriaDoc = Doc<"acceptanceCriteria"> & {
	taskId: Id<"tasks">
	text: string
	done: boolean
	order: number
}

export type TestDoc = Doc<"tests"> & {
	taskId: Id<"tasks">
	name: string
	status: "passed" | "pending" | "failed"
	output?: string
	duration?: number
	runAt?: number
}

export type ChatMessageDoc = Doc<"chatMessages"> & {
	projectId?: Id<"projects">
	taskId?: Id<"tasks">
	sender: "ai" | "user"
	text: string
	// AI response metadata (only populated for sender: "ai")
	model?: string
	provider?: string
	// Claude session ID for this message exchange (for session resumption)
	sessionId?: string
	createdAt: number
}

export type HistoryEventDoc = Doc<"historyEvents"> & {
	projectId?: Id<"projects">
	taskId?: Id<"tasks">
	action: string
	user: string
	metadata?: unknown
	createdAt: number
}

export type PullRequestDoc = Doc<"pullRequests"> & {
	taskId: Id<"tasks">
	prNumber: number
	title: string
	description?: string
	branch: string
	baseBranch: string
	status:
		| "draft"
		| "open"
		| "review_requested"
		| "changes_requested"
		| "approved"
		| "merged"
		| "closed"
	url?: string
	createdAt: number
	updatedAt: number
}

export type PrCommentDoc = Doc<"prComments"> & {
	pullRequestId: Id<"pullRequests">
	author: string
	body: string
	filePath?: string
	lineNumber?: number
	resolved: boolean
	createdAt: number
}

export type PrIssueDoc = Doc<"prIssues"> & {
	pullRequestId: Id<"pullRequests">
	severity: "error" | "warning" | "info"
	title: string
	description: string
	filePath: string
	lineNumber?: number
	suggestion?: string
	resolved: boolean
	createdAt: number
}

export type PrCheckDoc = Doc<"prChecks"> & {
	pullRequestId: Id<"pullRequests">
	name: string
	status: "pending" | "running" | "passed" | "failed" | "skipped"
	url?: string
	output?: string
	startedAt?: number
	completedAt?: number
}

export type ServerDoc = Doc<"servers"> & {
	name: string
	ip: string
	region: string
	status: "online" | "maintenance" | "offline"
	cpu: number
	mem: number
	sshUser?: string
	tailscaleHostname?: string
	createdAt: number
	updatedAt: number
}

export type ContainerDoc = Doc<"containers"> & {
	serverId: Id<"servers">
	containerId: string
	name: string
	image: string
	status: "running" | "stopped" | "restarting" | "paused" | "exited"
	port: string
	serverHostname?: string
	tailscaleHostname?: string
	createdAt: number
	updatedAt: number
}

export type ServerMetricDoc = Doc<"serverMetrics"> & {
	serverId: Id<"servers">
	cpu: number
	mem: number
	networkIn?: number
	networkOut?: number
	diskUsage?: number
	timestamp: number
}

export type WebhookEventDoc = Doc<"webhookEvents"> & {
	source: "github" | "cicd" | "agent"
	eventType: string
	payload: unknown
	status: "pending" | "processing" | "processed" | "failed"
	errorMessage?: string
	processedAt?: number
	retryCount: number
	createdAt: number
}

export type AgentJobDoc = Doc<"agentJobs"> & {
	taskId?: Id<"tasks">
	pullRequestId?: Id<"pullRequests">
	type: "chat_response" | "task_analysis" | "code_review" | "auto_fix"
	status: "pending" | "running" | "completed" | "failed"
	input?: unknown
	output?: unknown
	errorMessage?: string
	startedAt?: number
	completedAt?: number
	createdAt: number
}

// Task phase document types
export type TaskPhaseDoc = Doc<"taskPhases"> & {
	taskId: Id<"tasks">
	phase: TaskPhase
	status: PhaseStatus
	startedAt?: number
	completedAt?: number
	provider?: string
	model?: string
	prompt?: string
	permissionMode?: string
	result?: string
	error?: string
	agentSessionId?: string
	containerId?: string
	totalCostUsd?: number
	numTurns?: number
	order: number
	// Remediation tracking (for remediation phase only)
	currentRemediationCycle?: number
	remediationTriggeredBy?: RemediationTrigger
}

// Remediation cycle document type
export type RemediationCycleDoc = Doc<"remediationCycles"> & {
	taskId: Id<"tasks">
	cycleNumber: number
	triggeredBy: RemediationTrigger
	feedback?: string
	status: PhaseStatus
	startedAt?: number
	completedAt?: number
	provider?: string
	model?: string
	prompt?: string
	permissionMode?: string
	result?: string
	error?: string
	agentSessionId?: string
	containerId?: string
	totalCostUsd?: number
	numTurns?: number
	createdAt: number
}

export type PhaseConfigDoc = Doc<"phaseConfigs"> & {
	taskId?: Id<"tasks">
	phase: TaskPhase
	provider: string
	model: string
	permissionMode: string
	promptTemplate: string
	systemPrompt?: string
	maxBudgetUsd?: number
	maxRemediationCycles?: number
	enabled: boolean
	createdAt: number
	updatedAt: number
}

// Task template document type
export type TaskTemplateDoc = Doc<"taskTemplates"> & {
	name: string
	description: string
	phases: TaskPhase[]
	isDefault: boolean
	isBuiltin: boolean
	createdAt: number
	updatedAt: number
}

// Legacy interfaces for backward compatibility during migration
// These can be removed once all components are updated to use Convex types

export interface ChatMessagePart {
	type: "text" | "tool_use" | "thinking"
	content: string
	toolName?: string
	toolInput?: string
	toolId?: string // For matching tool_use with tool_result
	result?: {
		// Attached when tool_result arrives
		content: string
		isError: boolean
	}
}

export interface ChatMessage {
	id: string
	sender: "ai" | "user"
	text: string
	parts?: ChatMessagePart[] // Structured content for AI messages
	time: string
	isStreaming?: boolean
	// AI response metadata (only populated for sender: "ai")
	model?: string
	provider?: string
	// Whether this message is an error (e.g., API authentication failure)
	isError?: boolean
}

export interface HistoryEvent {
	id: string
	action: string
	user: string
	time: string
}

export interface AcceptanceCriteria {
	id: string
	text: string
	done: boolean
}

export interface Test {
	id: string
	name: string
	status: "passed" | "pending" | "failed"
}

export interface Task {
	id: string
	projectId?: string
	title: string
	category: "backlog" | "todo" | "in-progress" | "done"
	tag: string
	complexity: string
	description: string
	prompt?: string
	acceptanceCriteria?: AcceptanceCriteria[]
	tests?: Test[]
	chatHistory?: ChatMessage[]
	history?: HistoryEvent[]
	prCreated: boolean
	prNumber?: number
	prStatus?: string
	dependencies: string[]
	// Phase tracking
	currentPhase?: TaskPhase
	phaseUpdatedAt?: number
	activeContainerId?: string
	// Session tracking for chat resumption (requires same container)
	activeSessionId?: string
	implementationPrompt?: string
	// Template
	templateId?: string
}

export interface Project {
	id: string
	name: string
	description: string
	tasks: Task[]
	projectChatHistory?: ChatMessage[]
	plan?: string
	repo?: string
	branch?: string
	createdAt?: number
	updatedAt?: number
}

export interface Server {
	id: string
	name: string
	ip: string
	region: string
	status: "online" | "maintenance" | "offline"
	cpu: number
	mem: number
	sshUser?: string
	tailscaleHostname?: string
}

export interface Container {
	id: string
	containerId: string // Docker container ID
	name: string
	image: string
	status: "running" | "stopped" | "restarting" | "paused" | "exited"
	port: string
	server: string
	serverHostname?: string
	tailscaleNodeId?: string // Tailscale device ID (for deletion from Tailscale)
}

// Extended types that include related data (from Convex queries)
export interface TaskWithDetails extends TaskDoc {
	acceptanceCriteria: AcceptanceCriteriaDoc[]
	tests: TestDoc[]
	chatHistory: ChatMessageDoc[]
	history: HistoryEventDoc[]
	dependencies: TaskDoc[]
	blockedBy: TaskDoc[]
	pullRequest: PullRequestDoc | null
	phases: TaskPhaseDoc[]
}

export interface TaskWithPhases extends TaskDoc {
	phases: TaskPhaseDoc[]
}

export interface ProjectWithStats extends ProjectDoc {
	stats: {
		total: number
		backlog: number
		todo: number
		inProgress: number
		done: number
	}
}

export interface TaskWithProject extends TaskDoc {
	project: ProjectDoc | null
}

export interface ContainerWithServer extends ContainerDoc {
	serverName?: string
}

export interface PullRequestWithDetails extends PullRequestDoc {
	comments: PrCommentDoc[]
	issues: PrIssueDoc[]
	checks: PrCheckDoc[]
}

export interface ServerWithContainers extends ServerDoc {
	containers: ContainerDoc[]
}

// Type helpers for Convex IDs
export type AiProviderId = Id<"aiProviders">
export type ProjectId = Id<"projects">
export type TaskId = Id<"tasks">
export type AcceptanceCriteriaId = Id<"acceptanceCriteria">
export type TestId = Id<"tests">
export type ChatMessageId = Id<"chatMessages">
export type HistoryEventId = Id<"historyEvents">
export type PullRequestId = Id<"pullRequests">
export type PrCommentId = Id<"prComments">
export type PrIssueId = Id<"prIssues">
export type PrCheckId = Id<"prChecks">
export type ServerId = Id<"servers">
export type ContainerId = Id<"containers">
export type ServerMetricId = Id<"serverMetrics">
export type WebhookEventId = Id<"webhookEvents">
export type AgentJobId = Id<"agentJobs">
export type TaskPhaseId = Id<"taskPhases">
export type PhaseConfigId = Id<"phaseConfigs">
export type RemediationCycleId = Id<"remediationCycles">
export type TaskTemplateId = Id<"taskTemplates">

// Phase constants for UI
export const PHASE_ORDER: TaskPhase[] = [
	"requirements",
	"planning",
	"implementation",
	"ai_review",
	"remediation",
	"human_review",
	"merge",
]

export const PHASE_DISPLAY_NAMES: Record<TaskPhase, string> = {
	requirements: "Requirements",
	planning: "Planning",
	implementation: "Implementation",
	ai_review: "AI Review",
	remediation: "Remediation",
	human_review: "Human Review",
	merge: "Merge",
}

export const PHASE_DESCRIPTIONS: Record<TaskPhase, string> = {
	requirements: "Initial task definition by user",
	planning: "Agent develops acceptance criteria, implementation prompt, tests",
	implementation: "Agent writes code and creates PR",
	ai_review: "Agent reviews the PR for quality",
	remediation: "Agent fixes issues found during review",
	human_review: "Human tests preview and reviews with agent assistance",
	merge: "Agent attempts to merge PR into main",
}

// Phases that use agents (for configuration)
export const AGENT_PHASES: TaskPhase[] = [
	"planning",
	"implementation",
	"ai_review",
	"remediation",
	"human_review",
	"merge",
]

// Remediation trigger display names
export const REMEDIATION_TRIGGER_NAMES: Record<RemediationTrigger, string> = {
	ai_review: "AI Review",
	human_review: "Human Review",
}
