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
	totalConnections: number
	registeredContainers: number
}

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
}

// Export singleton instance
export const agentGateway = new AgentGatewayClient()

// Export class for custom instances
export { AgentGatewayClient }
