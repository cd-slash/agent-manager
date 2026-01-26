import { api } from "@agent-manager/convex/api"
import type { Id } from "@agent-manager/convex/dataModel"
import { useQuery } from "convex/react"
import { FileText, RefreshCw } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import type { Container, Server } from "@/types"

interface LogsModalProps {
	isOpen: boolean
	onClose: () => void
	servers?: Server[]
	containers?: Container[]
}

// Format timestamp to readable time
const formatTime = (timestamp: number): string => {
	return new Date(timestamp).toLocaleString()
}

export function LogsModal({
	isOpen,
	onClose,
	servers,
	containers,
}: LogsModalProps) {
	const [selectedIndex, setSelectedIndex] = useState(0)

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			onClose()
			setSelectedIndex(0)
		}
	}

	const items = servers || containers || []
	const isServer = !!servers
	const selectedItem = items[selectedIndex]

	// For servers, fetch latest metrics
	const serverMetrics = useQuery(
		api.servers.getMetrics,
		isServer && selectedItem
			? { serverId: selectedItem.id as Id<"servers"> }
			: "skip",
	)

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-3xl max-h-[80vh]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<FileText size={20} />
						{isServer ? "Server Metrics" : "Container Info"}
					</DialogTitle>
					<DialogDescription>
						{isServer
							? "View server resource usage and metrics."
							: "View container status and configuration."}
					</DialogDescription>
				</DialogHeader>

				{items.length > 1 && (
					<div className="flex gap-2 flex-wrap">
						{items.map((item, index) => (
							<Button
								key={item.id}
								variant={selectedIndex === index ? "default" : "outline"}
								size="sm"
								onClick={() => setSelectedIndex(index)}
							>
								{item.name}
							</Button>
						))}
					</div>
				)}

				<div className="bg-background border border-border rounded-lg overflow-hidden">
					<div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border">
						<span className="text-sm font-medium text-foreground">
							{selectedItem?.name || "Select an item"}
						</span>
						<Button variant="ghost" size="sm" className="h-7" disabled>
							<RefreshCw size={14} className="mr-1.5" />
							Refresh
						</Button>
					</div>
					<div className="h-80 overflow-auto p-4 font-mono text-sm">
						{isServer ? (
							serverMetrics ? (
								<div className="space-y-3 text-muted-foreground">
									<div className="grid grid-cols-2 gap-4">
										<div className="bg-surface rounded-lg p-3">
											<div className="text-xs uppercase tracking-wider mb-1">
												CPU Usage
											</div>
											<div className="text-2xl font-bold text-foreground">
												{serverMetrics.cpu}%
											</div>
										</div>
										<div className="bg-surface rounded-lg p-3">
											<div className="text-xs uppercase tracking-wider mb-1">
												Memory Usage
											</div>
											<div className="text-2xl font-bold text-foreground">
												{serverMetrics.mem}%
											</div>
										</div>
									</div>
									{serverMetrics.diskUsage !== undefined && (
										<div className="bg-surface rounded-lg p-3">
											<div className="text-xs uppercase tracking-wider mb-1">
												Disk Usage
											</div>
											<div className="text-2xl font-bold text-foreground">
												{serverMetrics.diskUsage}%
											</div>
										</div>
									)}
									{serverMetrics.networkIn !== undefined &&
										serverMetrics.networkOut !== undefined && (
											<div className="grid grid-cols-2 gap-4">
												<div className="bg-surface rounded-lg p-3">
													<div className="text-xs uppercase tracking-wider mb-1">
														Network In
													</div>
													<div className="text-lg font-bold text-foreground">
														{(serverMetrics.networkIn / 1024 / 1024).toFixed(2)}{" "}
														MB
													</div>
												</div>
												<div className="bg-surface rounded-lg p-3">
													<div className="text-xs uppercase tracking-wider mb-1">
														Network Out
													</div>
													<div className="text-lg font-bold text-foreground">
														{(serverMetrics.networkOut / 1024 / 1024).toFixed(
															2,
														)}{" "}
														MB
													</div>
												</div>
											</div>
										)}
									<div className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
										Last updated: {formatTime(serverMetrics.timestamp)}
									</div>
								</div>
							) : (
								<div className="text-muted-foreground text-center py-8">
									<FileText size={32} className="mx-auto mb-2 opacity-50" />
									<p>No metrics available for this server.</p>
									<p className="text-xs mt-1">
										Metrics are collected periodically from connected servers.
									</p>
								</div>
							)
						) : (
							<div className="space-y-3 text-muted-foreground">
								{selectedItem && "containerId" in selectedItem && (
									<>
										<div className="bg-surface rounded-lg p-3">
											<div className="text-xs uppercase tracking-wider mb-1">
												Container ID
											</div>
											<code className="text-sm text-foreground">
												{(selectedItem as Container).containerId}
											</code>
										</div>
										<div className="bg-surface rounded-lg p-3">
											<div className="text-xs uppercase tracking-wider mb-1">
												Image
											</div>
											<code className="text-sm text-foreground">
												{(selectedItem as Container).image}
											</code>
										</div>
										<div className="bg-surface rounded-lg p-3">
											<div className="text-xs uppercase tracking-wider mb-1">
												Status
											</div>
											<span className="text-sm text-foreground capitalize">
												{(selectedItem as Container).status}
											</span>
										</div>
										<div className="bg-surface rounded-lg p-3">
											<div className="text-xs uppercase tracking-wider mb-1">
												Server
											</div>
											<span className="text-sm text-foreground">
												{(selectedItem as Container).server}
											</span>
										</div>
									</>
								)}
								<div className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
									For detailed logs, connect to the container terminal.
								</div>
							</div>
						)}
					</div>
				</div>

				<div className="flex justify-end">
					<Button variant="outline" onClick={onClose}>
						Close
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
