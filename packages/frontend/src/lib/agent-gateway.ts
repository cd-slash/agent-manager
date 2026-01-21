/**
 * Agent Gateway API client
 *
 * Provides typed methods for interacting with the agent-gateway HTTP API.
 */

export interface CreateContainerRequest {
	repo: string
	branch?: string
	name?: string
	server?: string
	taskId?: string
	projectId?: string
}

export interface CreateContainerResult {
	name: string
	containerId: string
	hostname: string
	repo: string
	branch: string
	server: string
	network: "macvlan" | "bridge"
	lanIp?: string
	wgPort?: number
}

export interface ContainerInfo {
	containerId: string
	hostname: string
	version: string
	capabilities: string[]
	health: {
		status: "ok" | "degraded" | "error"
		activeProcesses: number
		version: string
		uptimeMs: number
		authenticated: boolean
		authMethod?: string
	} | null
	connectedAt: number
	lastHeartbeat: number
}

export interface GatewayHealth {
	status: string
	serverId: string
	hasAuthToken: boolean
	totalConnections: number
	registeredContainers: number
}

export interface AuthStatus {
	hasToken: boolean
}

export interface OAuthFlowResult {
	flowId: string
	url: string
	expiresIn: number
}

export interface OAuthCompleteResult {
	success: boolean
	token?: string
	error?: string
}

export interface PhaseExecutionResult {
	correlationId: string
	containerId: string
	taskId: string
	phase: string
	status: string
}

export interface ActiveExecution {
	correlationId: string
	containerId: string
	taskId: string
	projectId: string
	phase: string
	startedAt: number
}

export type TaskPhase =
	| "requirements"
	| "planning"
	| "implementation"
	| "ai_review"
	| "remediation"
	| "human_review"
	| "merge"

// Default gateway URL - can be overridden
const DEFAULT_GATEWAY_URL =
	(typeof import.meta !== "undefined" &&
		import.meta.env?.VITE_AGENT_GATEWAY_URL) ||
	"http://localhost:3100"

class AgentGatewayClient {
	private baseUrl: string

	constructor(baseUrl: string = DEFAULT_GATEWAY_URL) {
		this.baseUrl = baseUrl
	}

	private async request<T>(
		path: string,
		options: RequestInit = {},
	): Promise<T> {
		const response = await fetch(`${this.baseUrl}${path}`, {
			...options,
			headers: {
				"Content-Type": "application/json",
				...options.headers,
			},
		})

		if (!response.ok) {
			const error = await response.json().catch(() => ({}))
			throw new Error(
				error.error ||
					error.details ||
					`Request failed: ${response.statusText}`,
			)
		}

		return response.json()
	}

	/**
	 * Check gateway health
	 */
	async health(): Promise<GatewayHealth> {
		return this.request<GatewayHealth>("/health")
	}

	/**
	 * List connected containers
	 */
	async listContainers(): Promise<{ containers: ContainerInfo[] }> {
		return this.request<{ containers: ContainerInfo[] }>("/containers")
	}

	/**
	 * Get a specific container by ID
	 */
	async getContainer(containerId: string): Promise<ContainerInfo> {
		return this.request<ContainerInfo>(`/containers/${containerId}`)
	}

	/**
	 * Create a new container
	 */
	async createContainer(
		request: CreateContainerRequest,
	): Promise<CreateContainerResult> {
		return this.request<CreateContainerResult>("/containers/create", {
			method: "POST",
			body: JSON.stringify(request),
		})
	}

	/**
	 * Push auth token to a container
	 */
	async pushAuthToken(
		containerId: string,
		token: string,
	): Promise<{ status: string }> {
		return this.request<{ status: string }>(`/containers/${containerId}/auth`, {
			method: "POST",
			body: JSON.stringify({ token }),
		})
	}

	/**
	 * Start an execution on a container
	 */
	async startExecution(options: {
		containerId?: string
		message: string
		model?: string
		workingDirectory?: string
		permissionMode?: string
		taskId?: string
		projectId?: string
	}): Promise<{
		correlationId: string
		containerId: string
		status: string
	}> {
		return this.request("/exec", {
			method: "POST",
			body: JSON.stringify(options),
		})
	}

	/**
	 * Abort an execution
	 */
	async abortExecution(correlationId: string): Promise<{ status: string }> {
		return this.request<{ status: string }>(`/exec/${correlationId}/abort`, {
			method: "POST",
		})
	}

	/**
	 * Stop a container via SSH
	 */
	async stopContainer(
		containerName: string,
		server: string,
		sshUser?: string,
	): Promise<{ status: string; containerName: string; output: string }> {
		return this.request(`/containers/${containerName}/stop`, {
			method: "POST",
			body: JSON.stringify({ server, sshUser }),
		})
	}

	/**
	 * Delete a container via SSH (must be stopped first)
	 */
	async deleteContainer(
		containerName: string,
		server: string,
		sshUser?: string,
	): Promise<{ status: string; containerName: string; output: string }> {
		return this.request(`/containers/${containerName}`, {
			method: "DELETE",
			body: JSON.stringify({ server, sshUser }),
		})
	}

	// ==========================================================================
	// Authentication Methods
	// ==========================================================================

	/**
	 * Get auth status - check if gateway has a stored token
	 */
	async getAuthStatus(): Promise<AuthStatus> {
		return this.request<AuthStatus>("/auth/status")
	}

	/**
	 * Start OAuth flow to get a new token
	 * Returns a URL for the user to visit
	 */
	async startAuthSetup(): Promise<OAuthFlowResult> {
		return this.request<OAuthFlowResult>("/auth/setup/start", {
			method: "POST",
		})
	}

	/**
	 * Complete OAuth flow with authorization code
	 */
	async completeAuthSetup(
		flowId: string,
		code: string,
	): Promise<OAuthCompleteResult> {
		return this.request<OAuthCompleteResult>("/auth/setup/complete", {
			method: "POST",
			body: JSON.stringify({ flowId, code }),
		})
	}

	/**
	 * Manually set auth token
	 */
	async setAuthToken(token: string): Promise<{ success: boolean }> {
		return this.request<{ success: boolean }>("/auth/token", {
			method: "POST",
			body: JSON.stringify({ token }),
		})
	}

	// ==========================================================================
	// Task Phase Execution Methods
	// ==========================================================================

	/**
	 * Start execution of a task phase
	 */
	async startPhaseExecution(options: {
		taskId: string
		phase: TaskPhase
		containerId?: string
		customPrompt?: string
		configOverrides?: {
			model?: string
			permissionMode?: string
			maxBudget?: number
		}
	}): Promise<PhaseExecutionResult> {
		return this.request<PhaseExecutionResult>(
			`/tasks/${options.taskId}/phases/${options.phase}/start`,
			{
				method: "POST",
				body: JSON.stringify({
					containerId: options.containerId,
					customPrompt: options.customPrompt,
					configOverrides: options.configOverrides,
				}),
			},
		)
	}

	/**
	 * Get active task executions
	 */
	async getActiveExecutions(): Promise<{ executions: ActiveExecution[] }> {
		return this.request<{ executions: ActiveExecution[] }>("/tasks/executions")
	}
}

// Export singleton instance
export const agentGateway = new AgentGatewayClient()

// Export class for custom instances
export { AgentGatewayClient }
