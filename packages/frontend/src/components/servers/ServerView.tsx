import { api } from "@agent-manager/convex/api"
import type { ColumnDef } from "@tanstack/react-table"
import { useAction } from "convex/react"
import { FileText, Plus, RefreshCw, Server, Terminal } from "lucide-react"
import { useMemo, useState } from "react"
import {
	type FilterConfig,
	GenericListView,
} from "@/components/layouts/GenericListView"
import { LogsModal } from "@/components/modals/LogsModal"
import { TerminalInfoModal } from "@/components/modals/TerminalInfoModal"
import { useToast } from "@/components/ToastProvider"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import {
	HeaderDivider,
	HeaderSelectionButton,
} from "@/components/ui/table-actions"
import type { Server as ServerType } from "@/types"

interface ServerViewProps {
	servers: ServerType[]
	onSelectServer: (serverId: string) => void
}

const statusFilters: FilterConfig[] = [
	{
		key: "status",
		label: "Status",
		options: [
			{ value: "online", label: "Online" },
			{ value: "maintenance", label: "Maintenance" },
			{ value: "offline", label: "Offline" },
		],
	},
]

export function ServerView({ servers, onSelectServer }: ServerViewProps) {
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [selectedServers, setSelectedServers] = useState<ServerType[]>([])
	const [clearSelectionFn, setClearSelectionFn] = useState<(() => void) | null>(
		null,
	)
	const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false)
	const [isLogsModalOpen, setIsLogsModalOpen] = useState(false)
	const syncDevices = useAction(api.tailscale.syncDevices)
	const toast = useToast()

	const handleSelectionChange = (
		rows: ServerType[],
		clearSelection: () => void,
	) => {
		setSelectedServers(rows)
		setClearSelectionFn(() => clearSelection)
	}

	const handleRefreshFromTailscale = async () => {
		setIsRefreshing(true)
		try {
			await syncDevices()
			toast.success("Sync complete", "Servers refreshed from Tailscale")
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

	const columns: ColumnDef<ServerType>[] = useMemo(
		() => [
			{
				accessorKey: "name",
				header: "Server Name",
				cell: ({ row }) => (
					<div className="flex items-center font-medium text-foreground">
						<Server
							size={16}
							className="mr-3 text-muted-foreground group-hover:text-feature-blue transition-colors"
						/>
						{row.getValue("name")}
					</div>
				),
			},
			{
				accessorKey: "ip",
				header: "IP Address",
				cell: ({ row }) => (
					<span className="text-muted-foreground font-mono text-xs">
						{row.getValue("ip")}
					</span>
				),
			},
			{
				accessorKey: "region",
				header: "Region",
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{row.getValue("region")}
					</span>
				),
			},
			{
				accessorKey: "status",
				header: "Status",
				cell: ({ row }) => {
					const status = row.getValue("status") as
						| "online"
						| "maintenance"
						| "offline"
					return <StatusBadge type="server" status={status} uppercase />
				},
			},
			{
				id: "resources",
				header: "Resource Usage",
				enableSorting: false,
				size: 192,
				cell: ({ row }) => {
					const server = row.original
					return (
						<div className="space-y-sm">
							<div className="flex items-center text-xs text-muted-foreground">
								<span className="w-8">CPU</span>
								<div className="flex-1 h-1 bg-surface-elevated rounded-full mx-2">
									<div
										className="h-1 bg-feature-blue rounded-full"
										style={{ width: `${server.cpu}%` }}
									/>
								</div>
								<span className="w-6 text-right">{server.cpu}%</span>
							</div>
							<div className="flex items-center text-xs text-muted-foreground">
								<span className="w-8">MEM</span>
								<div className="flex-1 h-1 bg-surface-elevated rounded-full mx-2">
									<div
										className="h-1 bg-feature-purple rounded-full"
										style={{ width: `${server.mem}%` }}
									/>
								</div>
								<span className="w-6 text-right">{server.mem}%</span>
							</div>
						</div>
					)
				},
			},
		],
		[],
	)

	const selectedCount = selectedServers.length

	const headerActions = (
		<div className="flex items-center gap-2 h-9">
			{selectedCount > 0 && (
				<>
					<HeaderSelectionButton
						icon={<Terminal size={16} />}
						label="Terminal"
						count={selectedCount}
						onClick={() => setIsTerminalModalOpen(true)}
					/>
					<HeaderSelectionButton
						icon={<FileText size={16} />}
						label="Metrics"
						count={selectedCount}
						onClick={() => setIsLogsModalOpen(true)}
					/>
					<HeaderDivider />
				</>
			)}
			<Button
				variant="outline"
				onClick={handleRefreshFromTailscale}
				disabled={isRefreshing}
				className="h-9"
			>
				<RefreshCw
					size={16}
					className={`mr-2 ${isRefreshing ? "animate-spin" : ""}`}
				/>
				{isRefreshing ? "Syncing..." : "Refresh from Tailscale"}
			</Button>
			<Button variant="outline" className="h-9">
				<Plus size={16} className="mr-2" />
				Provision Server
			</Button>
		</div>
	)

	return (
		<>
			<GenericListView
				columns={columns}
				data={servers}
				onRowClick={(server) => onSelectServer(server.id)}
				enableRowSelection
				includeSelectionColumn
				enableSearch
				searchPlaceholder="Search servers..."
				searchFields={["name", "ip", "region"]}
				filters={statusFilters}
				headerActions={headerActions}
				onSelectionChange={handleSelectionChange}
				getRowId={(row) => row.id.toString()}
				className="p-page"
			/>
			<TerminalInfoModal
				isOpen={isTerminalModalOpen}
				onClose={() => {
					setIsTerminalModalOpen(false)
					clearSelectionFn?.()
				}}
				servers={selectedServers}
			/>
			<LogsModal
				isOpen={isLogsModalOpen}
				onClose={() => {
					setIsLogsModalOpen(false)
					clearSelectionFn?.()
				}}
				servers={selectedServers}
			/>
		</>
	)
}
