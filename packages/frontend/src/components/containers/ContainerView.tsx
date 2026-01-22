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
	const [deletingContainers, setDeletingContainers] = useState<Set<string>>(
		new Set(),
	)
	const syncDevices = useAction(api.tailscale.syncDevices)
	const updateContainerStatus = useMutation(api.containers.updateStatus)
	const deleteContainerFromDb = useMutation(api.containers.deleteContainer)
	const toast = useToast()

	// Use Convex-driven gateway commands
	const stopContainerCmd = useStopContainer()
	const deleteContainerCmd = useDeleteContainer()
	const createContainerCmd = useCreateContainer()

	const handleStopContainer = useCallback(
		async (container: Container) => {
			const serverHostname =
				container.serverHostname || container.server || "localhost"
			setStoppingContainers((prev) => new Set(prev).add(container.id))
			try {
				await stopContainerCmd.execute(container.name, serverHostname)
				await updateContainerStatus({
					id: container.id as Parameters<typeof updateContainerStatus>[0]["id"],
					status: "stopped",
				})
				toast.success(
					"Container stopped",
					`Container "${container.name}" has been stopped`,
				)
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
		[stopContainerCmd, updateContainerStatus, toast],
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
				await deleteContainerCmd.execute(container.name, serverHostname)
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

	const handleBulkStop = async () => {
		const toStop = selectedContainers.filter((c) => c.status === "running")
		for (const container of toStop) {
			await handleStopContainer(container)
		}
		clearSelectionFn?.()
	}

	const handleRefreshFromTailscale = async () => {
		setIsRefreshing(true)
		try {
			await syncDevices()
			toast.success("Sync complete", "Containers refreshed from Tailscale")
		} catch (error) {
			toast.error(
				"Sync failed",
				error instanceof Error
					? error.message
					: "Failed to sync from Tailscale",
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
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<Button
								variant="outline"
								disabled
								className="h-9 relative cursor-not-allowed"
							>
								<Play size={16} className="mr-2" />
								Start
								<span className="ml-1.5 inline-flex items-center justify-center rounded bg-foreground/10 text-muted-foreground text-[11px] font-medium min-w-[1.125rem] h-[1.125rem] px-1 tabular-nums">
									{startableCount}
								</span>
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent>
						<p>Starting containers is not yet implemented</p>
					</TooltipContent>
				</Tooltip>
			)}
			{(stoppableCount > 0 || startableCount > 0) && (
				<div className="h-6 w-px bg-border mx-1" />
			)}
			<Button
				variant="outline"
				size="icon"
				onClick={handleRefreshFromTailscale}
				disabled={isRefreshing}
				title="Refresh from Tailscale"
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
										<DropdownMenuItem disabled>
											<Play size={16} />
											Start (not available)
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
			handleStopContainer,
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
