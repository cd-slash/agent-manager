/**
 * Hook for executing gateway commands via Convex with status tracking.
 *
 * Gateway commands follow an async pattern:
 * 1. Frontend creates command (pending status)
 * 2. Gateway picks up and processes (processing status)
 * 3. Command completes or fails (completed/failed status)
 *
 * This hook provides a promise-based interface that resolves when the command completes.
 */

import { api } from "@agent-manager/convex/api"
import type { Id } from "@agent-manager/convex/dataModel"
import { useMutation, useQuery } from "convex/react"
import { useCallback, useEffect, useRef, useState } from "react"

type CommandStatus = "pending" | "queued" | "processing" | "completed" | "failed"

interface CommandResult<T = unknown> {
	status: CommandStatus
	result?: T
	error?: string
}

interface PendingCommand<T> {
	id: Id<"gatewayCommands">
	resolve: (result: T) => void
	reject: (error: Error) => void
}

/**
 * Hook for watching and waiting for a specific command to complete
 */
export function useCommandWatcher<T = unknown>(
	commandId: Id<"gatewayCommands"> | null,
): CommandResult<T> | null {
	const command = useQuery(
		api.gatewayCommands.get,
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
 * Hook for executing container creation commands
 */
export function useCreateContainer() {
	const createCommand = useMutation(api.gatewayCommands.createContainer)
	const [pendingId, setPendingId] = useState<Id<"gatewayCommands"> | null>(null)
	const pendingRef = useRef<PendingCommand<{
		name: string
		containerId: string
		hostname: string
		server: string
	}> | null>(null)

	const commandStatus = useCommandWatcher(pendingId)

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
			repo: string
			branch?: string
			name?: string
			server?: string
			taskId?: string
			projectId?: string
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
	const createCommand = useMutation(api.gatewayCommands.stopContainer)
	const [pendingId, setPendingId] = useState<Id<"gatewayCommands"> | null>(null)
	const pendingRef = useRef<PendingCommand<{
		status: string
		containerName: string
		output: string
	}> | null>(null)

	const commandStatus = useCommandWatcher(pendingId)

	useEffect(() => {
		if (!commandStatus || !pendingRef.current) return

		if (commandStatus.status === "completed" && commandStatus.result) {
			pendingRef.current.resolve(
				commandStatus.result as {
					status: string
					containerName: string
					output: string
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
		): Promise<{ status: string; containerName: string; output: string }> => {
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
	const createCommand = useMutation(api.gatewayCommands.deleteContainer)
	const [pendingId, setPendingId] = useState<Id<"gatewayCommands"> | null>(null)
	const pendingRef = useRef<PendingCommand<{
		status: string
		containerName: string
		output: string
	}> | null>(null)

	const commandStatus = useCommandWatcher(pendingId)

	useEffect(() => {
		if (!commandStatus || !pendingRef.current) return

		if (commandStatus.status === "completed" && commandStatus.result) {
			pendingRef.current.resolve(
				commandStatus.result as {
					status: string
					containerName: string
					output: string
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
		): Promise<{ status: string; containerName: string; output: string }> => {
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
 * Hook for starting executions on containers
 */
export function useStartExecution() {
	const createCommand = useMutation(api.gatewayCommands.startExecution)
	const [pendingId, setPendingId] = useState<Id<"gatewayCommands"> | null>(null)
	const pendingRef = useRef<PendingCommand<{
		correlationId: string
		containerId: string
		status: string
	}> | null>(null)

	const commandStatus = useCommandWatcher(pendingId)

	useEffect(() => {
		if (!commandStatus || !pendingRef.current) return

		if (commandStatus.status === "completed" && commandStatus.result) {
			pendingRef.current.resolve(
				commandStatus.result as {
					correlationId: string
					containerId: string
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
 * Hook for starting phase executions on tasks
 */
export function useStartPhaseExecution() {
	const createCommand = useMutation(api.gatewayCommands.startPhaseExecution)
	const [pendingId, setPendingId] = useState<Id<"gatewayCommands"> | null>(null)
	const pendingRef = useRef<PendingCommand<{
		correlationId: string
		containerId: string
		taskId: string
		phase: string
		status: string
	}> | null>(null)

	const commandStatus = useCommandWatcher(pendingId)

	useEffect(() => {
		if (!commandStatus || !pendingRef.current) return

		if (commandStatus.status === "completed" && commandStatus.result) {
			pendingRef.current.resolve(
				commandStatus.result as {
					correlationId: string
					containerId: string
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
			taskId: string
			phase:
				| "requirements"
				| "planning"
				| "implementation"
				| "ai_review"
				| "remediation"
				| "human_review"
				| "merge"
			containerId?: string
			customPrompt?: string
			configOverrides?: Record<string, unknown>
		}): Promise<{
			correlationId: string
			containerId: string
			taskId: string
			phase: string
			status: string
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
