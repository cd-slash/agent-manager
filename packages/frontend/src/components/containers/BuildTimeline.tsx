import {
	CheckCircle2,
	Clock,
	Loader2,
	SkipForward,
	XCircle,
} from "lucide-react"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"

// Phase display names and descriptions
const PHASE_INFO: Record<string, { name: string; description: string }> = {
	pending: { name: "Pending", description: "Waiting to start" },
	building_binary: {
		name: "Building Binary",
		description: "Compiling container-api",
	},
	building_image: {
		name: "Building Image",
		description: "Docker build in progress",
	},
	starting_container: {
		name: "Starting Container",
		description: "Container starting, Tailscale connecting",
	},
	deploying_binary: {
		name: "Deploying Binary",
		description: "Copying binary to container",
	},
	starting_api: {
		name: "Starting API",
		description: "Starting container-api service",
	},
	ready: { name: "Ready", description: "Fully operational" },
}

export interface BuildPhase {
	phase: string
	status: "pending" | "in_progress" | "completed" | "failed" | "skipped"
	startedAt?: number
	completedAt?: number
	error?: string
	logs?: string
	order: number
}

interface BuildTimelineProps {
	phases: BuildPhase[]
	currentPhase: string
	selectedPhase?: string
	onSelectPhase: (phase: string) => void
}

function formatDuration(startedAt?: number, completedAt?: number): string {
	if (!startedAt) return ""
	const end = completedAt || Date.now()
	const durationMs = end - startedAt

	if (durationMs < 1000) return `${durationMs}ms`
	if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`
	return `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
}

function PhaseIcon({
	status,
	isActive,
}: {
	status: BuildPhase["status"]
	isActive: boolean
}) {
	const iconSize = 18

	switch (status) {
		case "completed":
			return <CheckCircle2 size={iconSize} className="text-green-500" />
		case "failed":
			return <XCircle size={iconSize} className="text-red-500" />
		case "in_progress":
			return <Loader2 size={iconSize} className="text-blue-500 animate-spin" />
		case "skipped":
			return <SkipForward size={iconSize} className="text-muted-foreground" />
		default:
			return (
				<Clock
					size={iconSize}
					className={cn("text-muted-foreground", isActive && "text-blue-400")}
				/>
			)
	}
}

export function BuildTimeline({
	phases,
	currentPhase,
	selectedPhase,
	onSelectPhase,
}: BuildTimelineProps) {
	// Sort phases by order
	const sortedPhases = [...phases].sort((a, b) => a.order - b.order)

	return (
		<div className="relative">
			{/* Vertical line connecting all phases */}
			<div className="absolute left-[17px] top-4 bottom-4 w-px bg-border" />

			<div className="space-y-1">
				{sortedPhases.map((phase, index) => {
					const info = PHASE_INFO[phase.phase] || {
						name: phase.phase,
						description: "",
					}
					const isActive =
						phase.phase === currentPhase && phase.status === "in_progress"
					const isSelected = phase.phase === selectedPhase
					const _isLast = index === sortedPhases.length - 1
					const duration = formatDuration(phase.startedAt, phase.completedAt)

					return (
						<button
							key={phase.phase}
							onClick={() => onSelectPhase(phase.phase)}
							className={cn(
								"relative w-full text-left p-3 rounded-lg transition-colors flex items-start gap-3",
								"hover:bg-surface-elevated/50",
								isSelected && "bg-surface-elevated/70 border border-border",
								isActive && "bg-blue-950/20",
							)}
						>
							{/* Phase icon with connecting line background */}
							<div
								className={cn(
									"relative z-10 flex items-center justify-center w-9 h-9 rounded-full shrink-0",
									phase.status === "completed" && "bg-green-500/10",
									phase.status === "failed" && "bg-red-500/10",
									phase.status === "in_progress" && "bg-blue-500/10",
									phase.status === "skipped" && "bg-muted/20",
									phase.status === "pending" && "bg-surface",
								)}
							>
								<PhaseIcon status={phase.status} isActive={isActive} />
							</div>

							{/* Phase content */}
							<div className="flex-1 min-w-0 pt-1.5">
								<div className="flex items-center justify-between gap-2">
									<span
										className={cn(
											"font-medium text-sm truncate",
											phase.status === "completed" && "text-green-400",
											phase.status === "failed" && "text-red-400",
											phase.status === "in_progress" && "text-blue-400",
											phase.status === "skipped" && "text-muted-foreground",
											phase.status === "pending" && "text-muted-foreground",
										)}
									>
										{info.name}
									</span>
									<div className="flex items-center gap-2 shrink-0">
										{duration && (
											<span className="text-xs text-muted-foreground font-mono">
												{duration}
											</span>
										)}
										<StatusBadge
											type="buildPhase"
											status={phase.status}
											className="text-xs"
										/>
									</div>
								</div>
								<p className="text-xs text-muted-foreground mt-0.5 truncate">
									{phase.error || info.description}
								</p>
							</div>
						</button>
					)
				})}
			</div>
		</div>
	)
}
