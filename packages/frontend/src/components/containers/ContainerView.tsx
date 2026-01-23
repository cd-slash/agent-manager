import { api } from "@agent-manager/convex/api"
import type { ColumnDef } from "@tanstack/react-table"
import { useAction, useMutation } from "convex/react"
import {
	Box,
	MoreHorizontal,
	Play,
	Plus,
	RefreshCw,
	StopCircle,
	Terminal,
	Trash2,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import {
	type FilterConfig,
	GenericListView,
} from "@/components/layouts/GenericListView"
import { CreateContainerModal } from "@/components/modals/CreateContainerModal"
import { useToast } from "@/components/ToastProvider"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import {
	useCreateContainer,
	useDeleteContainer,
	useRestartContainer,
	useStopContainer,
} from "@/hooks/useGatewayCommand"
import type { Container } from "@/types"

interface ContainerViewProps {
	containers: Container[]
	onSelectContainer: (containerId: string) => void
}

const statusFilters: FilterConfig[] = [
	{
		key: "status",
		label: "Status",
		options: [
			{ value: "running", label: "Running" },
			{ value: "stopped", label: "Stopped" },
		],
	},
]

export function ContainerView({
	containers,
	onSelectContainer,
}: ContainerViewProps) {
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
	const [selectedContainers, setSelectedContainers] = useState<Container[]>([])
	const [clearSelectionFn, setClearSelectionFn] = useState<(() => void) | null>(
		null,
	)
	const [stoppingContainers, setStoppingContainers] = useState<Set<string>>(
		new Set(),
	)
	const [startingContainers, setStartingContainers] = useState<Set<string>>(
		new Set(),
	)
	const [deletingContainers, setDeletingContainers] = useState<Set<string>>(
		new Set(),
	)
	const syncDevices = useAction(api.tailscale.syncDevices)
	const syncWithHost = useAction(api.containers.syncWithHost)
	const updateContainerStatus = useMutation(api.containers.updateStatus)
	const deleteContainerFromDb = useMutation(api.containers.deleteContainer)
	const toast = useToast()

	// Use Convex-driven gateway commands
	const stopContainerCmd = useStopContainer()
	const restartContainerCmd = useRestartContainer()
	const deleteContainerCmd = useDeleteContainer()
	const createContainerCmd = useCreateContainer()

	const handleStopContainer = useCallback(
		async (container: Container) => {
			const serverHostname =
				container.serverHostname || container.server || "localhost"
			setStoppingContainers((prev) => new Set(prev).add(container.id))
			try {
				const result = await stopContainerCmd.execute(
					container.name,
					serverHostname,
				)

				if (result.notFound) {
					// Container doesn't exist on host - remove from database
					await deleteContainerFromDb({
						id: container.id as Parameters<typeof deleteContainerFromDb>[0]["id"],
					})
					toast.success(
						"Container removed",
						`Container "${container.name}" was not found on host and has been removed`,
					)
				} else {
					// Container was stopped - update status
					await updateContainerStatus({
						id: container.id as Parameters<
							typeof updateContainerStatus
						>[0]["id"],
						status: "stopped",
					})
					toast.success(
						"Container stopped",
						`Container "${container.name}" has been stopped`,
					)
				}
			} catch (error) {
				toast.error(
					"Failed to stop container",
					error instanceof Error ? error.message : "Unknown error",
				)
			} finally {
				setStoppingContainers((prev) => {
					const next = new Set(prev)
					next.delete(container.id)
					return next
				})
			}
		},
		[stopContainerCmd, updateContainerStatus, deleteContainerFromDb, toast],
	)

	const handleStartContainer = useCallback(
		async (container: Container) => {
			if (container.status === "running") {
				toast.error(
					"Container already running",
					"This container is already running",
				)
				return
			}
			const serverHostname =
				container.serverHostname || container.server || "localhost"
			setStartingContainers((prev) => new Set(prev).add(container.id))
			try {
				// Update status to restarting
				await updateContainerStatus({
					id: container.id as Parameters<typeof updateContainerStatus>[0]["id"],
					status: "restarting",
				})

				const result = await restartContainerCmd.execute(
					container.name,
					serverHostname,
				)

				if (result.notFound) {
					// Container doesn't exist on host - remove from database
					await deleteContainerFromDb({
						id: container.id as Parameters<typeof deleteContainerFromDb>[0]["id"],
					})
					toast.error(
						"Container not found",
						`Container "${container.name}" was not found on host and has been removed`,
					)
				} else {
					// Container was started - update status
					await updateContainerStatus({
						id: container.id as Parameters<
							typeof updateContainerStatus
						>[0]["id"],
						status: "running",
					})
					toast.success(
						"Container started",
						`Container "${container.name}" has been started`,
					)
				}
			} catch (error) {
				// Revert status on error
				await updateContainerStatus({
					id: container.id as Parameters<typeof updateContainerStatus>[0]["id"],
					status: "stopped",
				})
				toast.error(
					"Failed to start container",
					error instanceof Error ? error.message : "Unknown error",
				)
			} finally {
				setStartingContainers((prev) => {
					const next = new Set(prev)
					next.delete(container.id)
					return next
				})
			}
		},
		[restartContainerCmd, updateContainerStatus, deleteContainerFromDb, toast],
	)

	const handleDeleteContainer = useCallback(
		async (container: Container) => {
			if (container.status === "running") {
				toast.error(
					"Cannot delete running container",
					"Stop the container first before deleting",
				)
				return
			}
			const serverHostname =
				container.serverHostname || container.server || "localhost"
			setDeletingContainers((prev) => new Set(prev).add(container.id))
			try {
				// Try to delete from Docker host first
				try {
					await deleteContainerCmd.execute(container.name, serverHostname)
				} catch (dockerError) {
					// If Docker delete fails (e.g., container doesn't exist on host),
					// check if it's a "not found" type error and proceed with DB cleanup
					const errorMsg =
						dockerError instanceof Error
							? dockerError.message.toLowerCase()
							: ""
					const isNotFoundError =
						errorMsg.includes("no such container") ||
						errorMsg.includes("not found") ||
						errorMsg.includes("does not exist")

					if (!isNotFoundError) {
						// Re-throw if it's a different error
						throw dockerError
					}
					// Container doesn't exist on host, proceed to remove from DB
				}

				// Delete from database
				await deleteContainerFromDb({
					id: container.id as Parameters<typeof deleteContainerFromDb>[0]["id"],
				})
				toast.success(
					"Container deleted",
					`Container "${container.name}" has been deleted`,
				)
			} catch (error) {
				toast.error(
					"Failed to delete container",
					error instanceof Error ? error.message : "Unknown error",
				)
			} finally {
				setDeletingContainers((prev) => {
					const next = new Set(prev)
					next.delete(container.id)
					return next
				})
			}
		},
		[deleteContainerCmd, deleteContainerFromDb, toast],
	)

	// Force delete removes container from DB without trying Docker delete
	// Useful for orphaned containers that were manually deleted from the host
	const handleForceDeleteContainer = useCallback(
		async (container: Container) => {
			setDeletingContainers((prev) => new Set(prev).add(container.id))
			try {
				await deleteContainerFromDb({
					id: container.id as Parameters<typeof deleteContainerFromDb>[0]["id"],
				})
				toast.success(
					"Container removed",
					`Container "${container.name}" has been removed from the database`,
				)
			} catch (error) {
				toast.error(
					"Failed to remove container",
					error instanceof Error ? error.message : "Unknown error",
				)
			} finally {
				setDeletingContainers((prev) => {
					const next = new Set(prev)
					next.delete(container.id)
					return next
				})
			}
		},
		[deleteContainerFromDb, toast],
	)

	const handleBulkStop = async () => {
		const toStop = selectedContainers.filter((c) => c.status === "running")
		for (const container of toStop) {
			await handleStopContainer(container)
		}
		clearSelectionFn?.()
	}

	const handleBulkStart = async () => {
		const toStart = selectedContainers.filter((c) => c.status === "stopped")
		for (const container of toStart) {
			await handleStartContainer(container)
		}
		clearSelectionFn?.()
	}

	const handleBulkDelete = async () => {
		const toDelete = selectedContainers.filter((c) => c.status !== "running")
		for (const container of toDelete) {
			await handleDeleteContainer(container)
		}
		clearSelectionFn?.()
	}

	const handleRefresh = async () => {
		setIsRefreshing(true)
		try {
			// 1. Sync from Tailscale (for Tailscale-managed containers)
			await syncDevices()

			// 2. Sync with Docker host to verify containers actually exist
			// Get unique servers from current containers
			const servers = new Set<string>()
			for (const container of containers) {
				const server =
					container.serverHostname || container.server || "localhost"
				servers.add(server)
			}

			// Sync each server
			let totalRemoved = 0
			const removedNames: string[] = []
			for (const server of servers) {
				try {
					const result = await syncWithHost({ server })
					totalRemoved += result.removed
					removedNames.push(...result.removedContainers)
				} catch (syncError) {
					console.warn(`Failed to sync with host ${server}:`, syncError)
				}
			}

			if (totalRemoved > 0) {
				toast.success(
					"Sync complete",
					`Removed ${totalRemoved} orphaned container(s): ${removedNames.join(", ")}`,
				)
			} else {
				toast.success("Sync complete", "All containers verified")
			}
		} catch (error) {
			toast.error(
				"Sync failed",
				error instanceof Error
					? error.message
					: "Failed to sync containers",
			)
		} finally {
			setIsRefreshing(false)
		}
	}

	const handleCreateContainer = async (data: {
		repo: string
		branch: string
		name?: string
		server: string
	}) => {
		const result = await createContainerCmd.execute({
			repo: data.repo,
			branch: data.branch,
			name: data.name,
			server: data.server,
		})

		toast.success(
			"Container created",
			`Container "${result.name}" created on ${result.server}`,
		)

		// Sync to get the new container in the list
		await syncDevices()
	}

	const stoppableCount = selectedContainers.filter(
		(c) => c.status === "running",
	).length
	const startableCount = selectedContainers.filter(
		(c) => c.status === "stopped",
	).length
	const deletableCount = selectedContainers.filter(
		(c) => c.status !== "running",
	).length

	const headerActions = (
		<div className="flex items-center gap-2 h-9">
			{stoppableCount > 0 && (
				<Button
					variant="outline"
					onClick={handleBulkStop}
					className="h-9 text-destructive hover:text-destructive relative"
				>
					<StopCircle size={16} className="mr-2" />
					Stop
					<span className="ml-1.5 inline-flex items-center justify-center rounded bg-destructive/15 text-destructive text-[11px] font-medium min-w-[1.125rem] h-[1.125rem] px-1 tabular-nums">
						{stoppableCount}
					</span>
				</Button>
			)}
			{startableCount > 0 && (
				<Button
					variant="outline"
					onClick={handleBulkStart}
					className="h-9 text-success hover:text-success relative"
				>
					<Play size={16} className="mr-2" />
					Start
					<span className="ml-1.5 inline-flex items-center justify-center rounded bg-success/15 text-success text-[11px] font-medium min-w-[1.125rem] h-[1.125rem] px-1 tabular-nums">
						{startableCount}
					</span>
				</Button>
			)}
			{deletableCount > 0 && (
				<Button
					variant="outline"
					onClick={handleBulkDelete}
					className="h-9 text-destructive hover:text-destructive relative"
				>
					<Trash2 size={16} className="mr-2" />
					Delete
					<span className="ml-1.5 inline-flex items-center justify-center rounded bg-destructive/15 text-destructive text-[11px] font-medium min-w-[1.125rem] h-[1.125rem] px-1 tabular-nums">
						{deletableCount}
					</span>
				</Button>
			)}
			{(stoppableCount > 0 || startableCount > 0 || deletableCount > 0) && (
				<div className="h-6 w-px bg-border mx-1" />
			)}
			<Button
				variant="outline"
				size="icon"
				onClick={handleRefresh}
				disabled={isRefreshing}
				title="Refresh and verify containers"
				className="h-9 w-9"
			>
				<RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
			</Button>
			<Button
				variant="outline"
				onClick={() => setIsCreateModalOpen(true)}
				className="h-9"
			>
				<Plus size={16} className="mr-2" />
				New
			</Button>
		</div>
	)

	const columns: ColumnDef<Container>[] = useMemo(
		() => [
			{
				accessorKey: "name",
				header: "Container Name",
				cell: ({ row }) => {
					const container = row.original
					return (
						<div>
							<div className="font-medium text-foreground flex items-center">
								<Box size={14} className="mr-2 text-muted-foreground" />
								{container.name}
							</div>
							<div className="text-xs text-muted-foreground font-mono mt-0.5 ml-6">
								ID: {container.id}
							</div>
						</div>
					)
				},
			},
			{
				accessorKey: "image",
				header: "Image",
				cell: ({ row }) => (
					<span className="text-muted-foreground font-mono text-xs">
						{row.getValue("image")}
					</span>
				),
			},
			{
				accessorKey: "status",
				header: "Status",
				cell: ({ row }) => {
					const status = row.getValue("status") as string
					return (
						<div className="flex items-center">
							<div
								className={`w-2 h-2 rounded-full mr-2 ${
									status === "running"
										? "bg-success animate-pulse"
										: "bg-destructive"
								}`}
							/>
							<span
								className={`capitalize ${
									status === "running" ? "text-success" : "text-destructive"
								}`}
							>
								{status}
							</span>
						</div>
					)
				},
			},
			{
				accessorKey: "server",
				header: "Host Server",
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{row.getValue("server")}
					</span>
				),
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => {
					const container = row.original
					const isRunning = container.status === "running"
					return (
						<div className="flex justify-end">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={(e) => e.stopPropagation()}
									>
										<MoreHorizontal size={16} />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="end"
									onClick={(e) => e.stopPropagation()}
								>
									<DropdownMenuItem
										onClick={() => {
											// TODO: Implement open terminal
										}}
									>
										<Terminal size={16} />
										Terminal
									</DropdownMenuItem>
									{isRunning ? (
										<DropdownMenuItem
											onClick={() => handleStopContainer(container)}
											disabled={stoppingContainers.has(container.id)}
										>
											<StopCircle size={16} />
											{stoppingContainers.has(container.id)
												? "Stopping..."
												: "Stop"}
										</DropdownMenuItem>
									) : (
										<DropdownMenuItem
											onClick={() => handleStartContainer(container)}
											disabled={startingContainers.has(container.id)}
										>
											<Play size={16} />
											{startingContainers.has(container.id)
												? "Starting..."
												: "Start"}
										</DropdownMenuItem>
									)}
									<DropdownMenuSeparator />
									<DropdownMenuItem
										className={
											isRunning
												? "text-muted-foreground"
												: "text-destructive focus:text-destructive"
										}
										onClick={() =>
											!isRunning && handleDeleteContainer(container)
										}
										disabled={isRunning || deletingContainers.has(container.id)}
									>
										<Trash2 size={16} />
										{deletingContainers.has(container.id)
											? "Deleting..."
											: isRunning
												? "Delete (stop first)"
												: "Delete"}
									</DropdownMenuItem>
									<DropdownMenuItem
										className="text-destructive focus:text-destructive"
										onClick={() => handleForceDeleteContainer(container)}
										disabled={deletingContainers.has(container.id)}
									>
										<Trash2 size={16} />
										{deletingContainers.has(container.id)
											? "Removing..."
											: "Force Remove (DB only)"}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)
				},
			},
		],
		[
			deletingContainers,
			handleDeleteContainer,
			handleForceDeleteContainer,
			handleStartContainer,
			handleStopContainer,
			startingContainers,
			stoppingContainers,
		],
	)

	const handleSelectionChange = (
		rows: Container[],
		clearSelection: () => void,
	) => {
		setSelectedContainers(rows)
		setClearSelectionFn(() => clearSelection)
	}

	return (
		<>
			<GenericListView
				columns={columns}
				data={containers}
				onRowClick={(container) => onSelectContainer(container.id)}
				enableRowSelection
				includeSelectionColumn
				enableSearch
				searchPlaceholder="Search containers..."
				searchFields={["name", "image", "server"]}
				filters={statusFilters}
				headerActions={headerActions}
				onSelectionChange={handleSelectionChange}
				emptyMessage="No containers found matching your filters."
				getRowId={(row) => row.id}
				className="p-page"
			/>
			<CreateContainerModal
				isOpen={isCreateModalOpen}
				onClose={() => setIsCreateModalOpen(false)}
				onCreate={handleCreateContainer}
			/>
		</>
	)
}
