/**
 * Hooks for executing commands via Convex with status tracking.
 *
 * Commands are split between two tables:
 * - serverCommands: Infrastructure operations (create/stop/delete containers) processed by gateway via SSH
 * - containerCommands: Container-targeted operations (executions, OAuth) processed directly by containers
 *
 * Each hook provides a promise-based interface that resolves when the command completes.
 */

import { api } from "@agent-manager/convex/api"
import type { Id } from "@agent-manager/convex/dataModel"
import { useMutation, useQuery } from "convex/react"
import { useCallback, useEffect, useRef, useState } from "react"

type CommandStatus = "pending" | "processing" | "completed" | "failed"

interface CommandResult<T = unknown> {
	status: CommandStatus
	result?: T
	error?: string
}

interface PendingServerCommand<T> {
	id: Id<"serverCommands">
	resolve: (result: T) => void
	reject: (error: Error) => void
}

interface PendingContainerCommand<T> {
	id: Id<"containerCommands">
	resolve: (result: T) => void
	reject: (error: Error) => void
}

/**
 * Hook for watching and waiting for a server command to complete
 */
export function useServerCommandWatcher<T = unknown>(
	commandId: Id<"serverCommands"> | null,
): CommandResult<T> | null {
	const command = useQuery(
		api.serverCommands.get,
		commandId ? { id: commandId } : "skip",
	)

	if (!command) return null

	return {
		status: command.status,
		result: command.result as T,
		error: command.error,
	}
}

/**
 * Hook for watching and waiting for a container command to complete
 */
export function useContainerCommandWatcher<T = unknown>(
	commandId: Id<"containerCommands"> | null,
): CommandResult<T> | null {
	const command = useQuery(
		api.containerCommands.get,
		commandId ? { id: commandId } : "skip",
	)

	if (!command) return null

	return {
		status: command.status,
		result: command.result as T,
		error: command.error,
	}
}

// =============================================================================
// Server Commands (Gateway processes via SSH/Docker)
// =============================================================================

/**
 * Hook for executing container creation commands
 */
export function useCreateContainer() {
	const createCommand = useMutation(api.serverCommands.createContainer)
	const [pendingId, setPendingId] = useState<Id<"serverCommands"> | null>(null)
	const pendingRef = useRef<PendingServerCommand<{
		name: string
		containerId: string
		hostname: string
		server: string
	}> | null>(null)

	const commandStatus = useServerCommandWatcher(pendingId)

	// Watch for completion
	useEffect(() => {
		if (!commandStatus || !pendingRef.current) return

		if (commandStatus.status === "completed" && commandStatus.result) {
			pendingRef.current.resolve(
				commandStatus.result as {
					name: string
					containerId: string
					hostname: string
					server: string
				},
			)
			pendingRef.current = null
			setPendingId(null)
		} else if (commandStatus.status === "failed") {
			pendingRef.current.reject(
				new Error(commandStatus.error || "Command failed"),
			)
			pendingRef.current = null
			setPendingId(null)
		}
	}, [commandStatus])

	const execute = useCallback(
		(args: {
			repo?: string
			branch?: string
			name?: string
			server?: string
			taskId?: string
			projectId?: string
			containerType?: string
		}): Promise<{
			name: string
			containerId: string
			hostname: string
			server: string
		}> => {
			return new Promise((resolve, reject) => {
				createCommand(args)
					.then((commandId) => {
						pendingRef.current = {
							id: commandId,
							resolve,
							reject,
						}
						setPendingId(commandId)
					})
					.catch(reject)
			})
		},
		[createCommand],
	)

	return {
		execute,
		isPending: pendingId !== null,
		status: commandStatus?.status ?? null,
	}
}

/**
 * Hook for executing container stop commands
 */
export function useStopContainer() {
	const createCommand = useMutation(api.serverCommands.stopContainer)
	const [pendingId, setPendingId] = useState<Id<"serverCommands"> | null>(null)
	const pendingRef = useRef<PendingServerCommand<{
		stopped: boolean
		notFound: boolean
		containerName: string
	}> | null>(null)

	const commandStatus = useServerCommandWatcher(pendingId)

	useEffect(() => {
		if (!commandStatus || !pendingRef.current) return

		if (commandStatus.status === "completed" && commandStatus.result) {
			pendingRef.current.resolve(
				commandStatus.result as {
					stopped: boolean
					notFound: boolean
					containerName: string
				},
			)
			pendingRef.current = null
			setPendingId(null)
		} else if (commandStatus.status === "failed") {
			pendingRef.current.reject(
				new Error(commandStatus.error || "Command failed"),
			)
			pendingRef.current = null
			setPendingId(null)
		}
	}, [commandStatus])

	const execute = useCallback(
		(
			containerName: string,
			server: string,
			sshUser?: string,
		): Promise<{ stopped: boolean; notFound: boolean; containerName: string }> => {
			return new Promise((resolve, reject) => {
				createCommand({
					containerName,
					server,
					sshUser,
				})
					.then((commandId) => {
						pendingRef.current = {
							id: commandId,
							resolve,
							reject,
						}
						setPendingId(commandId)
					})
					.catch(reject)
			})
		},
		[createCommand],
	)

	return {
		execute,
		isPending: pendingId !== null,
		status: commandStatus?.status ?? null,
	}
}

/**
 * Hook for executing container restart commands (with fresh Tailscale auth key)
 */
export function useRestartContainer() {
	const createCommand = useMutation(api.serverCommands.restartContainer)
	const [pendingId, setPendingId] = useState<Id<"serverCommands"> | null>(null)
	const pendingRef = useRef<PendingServerCommand<{
		restarted: boolean
		notFound: boolean
		containerName: string
	}> | null>(null)

	const commandStatus = useServerCommandWatcher(pendingId)

	useEffect(() => {
		if (!commandStatus || !pendingRef.current) return

		if (commandStatus.status === "completed" && commandStatus.result) {
			pendingRef.current.resolve(
				commandStatus.result as {
					restarted: boolean
					notFound: boolean
					containerName: string
				},
			)
			pendingRef.current = null
			setPendingId(null)
		} else if (commandStatus.status === "failed") {
			pendingRef.current.reject(
				new Error(commandStatus.error || "Command failed"),
			)
			pendingRef.current = null
			setPendingId(null)
		}
	}, [commandStatus])

	const execute = useCallback(
		(
			containerName: string,
			server: string,
			sshUser?: string,
		): Promise<{ restarted: boolean; notFound: boolean; containerName: string }> => {
			return new Promise((resolve, reject) => {
				createCommand({
					containerName,
					server,
					sshUser,
				})
					.then((commandId) => {
						pendingRef.current = {
							id: commandId,
							resolve,
							reject,
						}
						setPendingId(commandId)
					})
					.catch(reject)
			})
		},
		[createCommand],
	)

	return {
		execute,
		isPending: pendingId !== null,
		status: commandStatus?.status ?? null,
	}
}

/**
 * Hook for executing container delete commands
 */
export function useDeleteContainer() {
	const createCommand = useMutation(api.serverCommands.deleteContainer)
	const [pendingId, setPendingId] = useState<Id<"serverCommands"> | null>(null)
	const pendingRef = useRef<PendingServerCommand<{
		deleted: boolean
		containerName: string
	}> | null>(null)

	const commandStatus = useServerCommandWatcher(pendingId)

	useEffect(() => {
		if (!commandStatus || !pendingRef.current) return

		if (commandStatus.status === "completed" && commandStatus.result) {
			pendingRef.current.resolve(
				commandStatus.result as {
					deleted: boolean
					containerName: string
				},
			)
			pendingRef.current = null
			setPendingId(null)
		} else if (commandStatus.status === "failed") {
			pendingRef.current.reject(
				new Error(commandStatus.error || "Command failed"),
			)
			pendingRef.current = null
			setPendingId(null)
		}
	}, [commandStatus])

	const execute = useCallback(
		(
			containerName: string,
			server: string,
			sshUser?: string,
		): Promise<{ deleted: boolean; containerName: string }> => {
			return new Promise((resolve, reject) => {
				createCommand({
					containerName,
					server,
					sshUser,
				})
					.then((commandId) => {
						pendingRef.current = {
							id: commandId,
							resolve,
							reject,
						}
						setPendingId(commandId)
					})
					.catch(reject)
			})
		},
		[createCommand],
	)

	return {
		execute,
		isPending: pendingId !== null,
		status: commandStatus?.status ?? null,
	}
}

// =============================================================================
// Container Commands (Containers process directly)
// =============================================================================

/**
 * Hook for starting executions on containers
 */
export function useStartExecution() {
	const createCommand = useMutation(api.containerCommands.startExecution)
	const [pendingId, setPendingId] = useState<Id<"containerCommands"> | null>(null)
	const pendingRef = useRef<PendingContainerCommand<{
		correlationId: string
		status: string
	}> | null>(null)

	const commandStatus = useContainerCommandWatcher(pendingId)

	useEffect(() => {
		if (!commandStatus || !pendingRef.current) return

		if (commandStatus.status === "completed" && commandStatus.result) {
			pendingRef.current.resolve(
				commandStatus.result as {
					correlationId: string
					status: string
				},
			)
			pendingRef.current = null
			setPendingId(null)
		} else if (commandStatus.status === "failed") {
			pendingRef.current.reject(
				new Error(commandStatus.error || "Command failed"),
			)
			pendingRef.current = null
			setPendingId(null)
		}
	}, [commandStatus])

	const execute = useCallback(
		(args: {
			containerId: string
			message: string
			model?: string
			workingDirectory?: string
			permissionMode?: string
			taskId?: string
			projectId?: string
		}): Promise<{
			correlationId: string
			status: string
		}> => {
			return new Promise((resolve, reject) => {
				createCommand(args)
					.then((result) => {
						pendingRef.current = {
							id: result.commandId,
							resolve,
							reject,
						}
						setPendingId(result.commandId)
					})
					.catch(reject)
			})
		},
		[createCommand],
	)

	return {
		execute,
		isPending: pendingId !== null,
		status: commandStatus?.status ?? null,
	}
}

/**
 * Hook for starting phase executions on tasks
 */
export function useStartPhaseExecution() {
	const createCommand = useMutation(api.containerCommands.startPhaseExecution)
	const [pendingId, setPendingId] = useState<Id<"containerCommands"> | null>(null)
	const pendingRef = useRef<PendingContainerCommand<{
		correlationId: string
		taskId: string
		phase: string
		status: string
	}> | null>(null)

	const commandStatus = useContainerCommandWatcher(pendingId)

	useEffect(() => {
		if (!commandStatus || !pendingRef.current) return

		if (commandStatus.status === "completed" && commandStatus.result) {
			pendingRef.current.resolve(
				commandStatus.result as {
					correlationId: string
					taskId: string
					phase: string
					status: string
				},
			)
			pendingRef.current = null
			setPendingId(null)
		} else if (commandStatus.status === "failed") {
			pendingRef.current.reject(
				new Error(commandStatus.error || "Command failed"),
			)
			pendingRef.current = null
			setPendingId(null)
		}
	}, [commandStatus])

	const execute = useCallback(
		(args: {
			containerId: string
			taskId: string
			phase:
				| "requirements"
				| "planning"
				| "implementation"
				| "ai_review"
				| "remediation"
				| "human_review"
				| "merge"
			customPrompt?: string
			configOverrides?: Record<string, unknown>
		}): Promise<{
			correlationId: string
			taskId: string
			phase: string
			status: string
		}> => {
			return new Promise((resolve, reject) => {
				createCommand(args)
					.then((result) => {
						pendingRef.current = {
							id: result.commandId,
							resolve,
							reject,
						}
						setPendingId(result.commandId)
					})
					.catch(reject)
			})
		},
		[createCommand],
	)

	return {
		execute,
		isPending: pendingId !== null,
		status: commandStatus?.status ?? null,
	}
}
