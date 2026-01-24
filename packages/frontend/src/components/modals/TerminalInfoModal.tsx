import { Check, Copy, Terminal } from "lucide-react"
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

interface TerminalInfoModalProps {
	isOpen: boolean
	onClose: () => void
	servers?: Server[]
	containers?: Container[]
}

export function TerminalInfoModal({
	isOpen,
	onClose,
	servers,
	containers,
}: TerminalInfoModalProps) {
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

	const handleCopy = (text: string, index: number) => {
		navigator.clipboard.writeText(text)
		setCopiedIndex(index)
		setTimeout(() => setCopiedIndex(null), 2000)
	}

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			onClose()
		}
	}

	// Generate commands for servers
	const serverCommands = servers?.map((server) => {
		const user = server.sshUser || "root"
		const host = server.tailscaleHostname || server.ip
		return {
			label: server.name,
			command: `ssh ${user}@${host}`,
			host,
		}
	})

	// Generate commands for containers
	const containerCommands = containers?.map((container) => {
		const host = container.serverHostname || "localhost"
		return {
			label: container.name,
			command: `ssh ${host} -t "docker exec -it ${container.containerId.slice(0, 12)} /bin/bash"`,
			containerId: container.containerId,
		}
	})

	const commands = serverCommands || containerCommands || []
	const isServer = !!servers

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Terminal size={20} />
						{isServer ? "Connect to Server" : "Connect to Container"}
					</DialogTitle>
					<DialogDescription>
						{commands.length === 1
							? "Copy the command below to connect via terminal."
							: `Copy the commands below to connect to ${commands.length} ${isServer ? "servers" : "containers"}.`}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3 pt-4">
					{commands.map((item, index) => (
						<div
							key={index}
							className="bg-surface border border-border rounded-lg p-4"
						>
							<div className="flex items-center justify-between mb-2">
								<span className="text-sm font-medium text-foreground">
									{item.label}
								</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleCopy(item.command, index)}
									className="h-7"
								>
									{copiedIndex === index ? (
										<>
											<Check size={14} className="mr-1.5 text-green-500" />
											Copied
										</>
									) : (
										<>
											<Copy size={14} className="mr-1.5" />
											Copy
										</>
									)}
								</Button>
							</div>
							<code className="block bg-background border border-border rounded px-3 py-2 text-sm font-mono text-muted-foreground break-all">
								{item.command}
							</code>
						</div>
					))}
				</div>
				<div className="flex justify-end pt-4">
					<Button variant="outline" onClick={onClose}>
						Close
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
