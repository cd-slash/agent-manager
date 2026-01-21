import {
	AlertCircle,
	Check,
	ChevronRight,
	Circle,
	Clock,
	SkipForward,
} from "lucide-react"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
	PHASE_DISPLAY_NAMES,
	PHASE_ORDER,
	type PhaseStatus,
	type TaskPhase,
	type TaskPhaseDoc,
} from "@/types"

interface PhaseTimelineProps {
	phases: TaskPhaseDoc[]
	currentPhase?: TaskPhase
	onPhaseClick?: (phase: TaskPhase) => void
	compact?: boolean
}

function getPhaseStatusIcon(status: PhaseStatus, size: number = 14) {
	switch (status) {
		case "completed":
			return <Check size={size} />
		case "in_progress":
			return <Clock size={size} className="animate-pulse" />
		case "failed":
			return <AlertCircle size={size} />
		case "skipped":
			return <SkipForward size={size} />
		default:
			return <Circle size={size} />
	}
}

function getPhaseStatusColor(status: PhaseStatus): string {
	switch (status) {
		case "completed":
			return "bg-success text-success-foreground border-success"
		case "in_progress":
			return "bg-primary text-primary-foreground border-primary"
		case "failed":
			return "bg-destructive text-destructive-foreground border-destructive"
		case "skipped":
			return "bg-muted text-muted-foreground border-muted"
		default:
			return "bg-background text-muted-foreground border-border"
	}
}

function getConnectorColor(
	fromStatus: PhaseStatus,
	toStatus: PhaseStatus,
): string {
	if (fromStatus === "completed" || fromStatus === "skipped") {
		if (
			toStatus === "completed" ||
			toStatus === "in_progress" ||
			toStatus === "skipped"
		) {
			return "bg-success"
		}
	}
	return "bg-border"
}

export function PhaseTimeline({
	phases,
	currentPhase,
	onPhaseClick,
	compact = false,
}: PhaseTimelineProps) {
	// Create a map of phase to its record
	const phaseMap = new Map(phases.map((p) => [p.phase, p]))

	// Get ordered phases with their records
	const orderedPhases = PHASE_ORDER.map((phase) => ({
		phase,
		record: phaseMap.get(phase),
	}))

	if (compact) {
		return (
			<div className="flex items-center gap-1">
				{orderedPhases.map(({ phase, record }, index) => {
					const status = record?.status || "pending"
					const isActive = phase === currentPhase

					return (
						<div key={phase} className="flex items-center">
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={() => onPhaseClick?.(phase)}
										className={cn(
											"flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all",
											getPhaseStatusColor(status),
											isActive &&
												"ring-2 ring-primary ring-offset-2 ring-offset-background",
											onPhaseClick && "cursor-pointer hover:scale-110",
										)}
									>
										{getPhaseStatusIcon(status, 12)}
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<p className="font-medium">{PHASE_DISPLAY_NAMES[phase]}</p>
									<p className="text-xs text-muted-foreground capitalize">
										{status.replace("_", " ")}
									</p>
									{record?.model && (
										<p className="text-xs text-muted-foreground">
											{record.model}
										</p>
									)}
								</TooltipContent>
							</Tooltip>
							{index < orderedPhases.length - 1 && (
								<div
									className={cn(
										"w-3 h-0.5",
										getConnectorColor(
											status,
											orderedPhases[index + 1]?.record?.status || "pending",
										),
									)}
								/>
							)}
						</div>
					)
				})}
			</div>
		)
	}

	return (
		<div className="flex items-center justify-between w-full overflow-x-auto py-2">
			{orderedPhases.map(({ phase, record }, index) => {
				const status = record?.status || "pending"
				const isActive = phase === currentPhase

				return (
					<div key={phase} className="flex items-center flex-1 last:flex-none">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => onPhaseClick?.(phase)}
									className={cn(
										"flex flex-col items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all min-w-[80px]",
										onPhaseClick && "cursor-pointer hover:bg-surface",
										isActive && "bg-surface",
									)}
								>
									<div
										className={cn(
											"flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all",
											getPhaseStatusColor(status),
											isActive &&
												"ring-2 ring-primary ring-offset-2 ring-offset-background",
										)}
									>
										{getPhaseStatusIcon(status, 16)}
									</div>
									<span
										className={cn(
											"text-[10px] font-medium whitespace-nowrap",
											isActive ? "text-foreground" : "text-muted-foreground",
										)}
									>
										{PHASE_DISPLAY_NAMES[phase]}
									</span>
									{record?.model && (
										<span className="text-[9px] text-muted-foreground truncate max-w-[70px]">
											{record.model.split("-").slice(0, 2).join(" ")}
										</span>
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<div className="space-y-1">
									<p className="font-medium">{PHASE_DISPLAY_NAMES[phase]}</p>
									<p className="text-xs text-muted-foreground capitalize">
										Status: {status.replace("_", " ")}
									</p>
									{record?.model && (
										<p className="text-xs text-muted-foreground">
											Model: {record.model}
										</p>
									)}
									{record?.totalCostUsd !== undefined && (
										<p className="text-xs text-muted-foreground">
											Cost: ${record.totalCostUsd.toFixed(4)}
										</p>
									)}
									{record?.numTurns !== undefined && (
										<p className="text-xs text-muted-foreground">
											Turns: {record.numTurns}
										</p>
									)}
									{record?.startedAt && (
										<p className="text-xs text-muted-foreground">
											Started: {new Date(record.startedAt).toLocaleString()}
										</p>
									)}
									{record?.completedAt && (
										<p className="text-xs text-muted-foreground">
											Completed: {new Date(record.completedAt).toLocaleString()}
										</p>
									)}
								</div>
							</TooltipContent>
						</Tooltip>
						{index < orderedPhases.length - 1 && (
							<div className="flex-1 flex items-center justify-center min-w-[20px]">
								<ChevronRight
									size={16}
									className={cn(
										status === "completed" || status === "skipped"
											? "text-success"
											: "text-muted-foreground/30",
									)}
								/>
							</div>
						)}
					</div>
				)
			})}
		</div>
	)
}

// Mini version for use in task cards
export function PhaseTimelineMini({
	phases,
	currentPhase: _currentPhase,
}: Pick<PhaseTimelineProps, "phases" | "currentPhase">) {
	const phaseMap = new Map(phases.map((p) => [p.phase, p]))

	return (
		<div className="flex items-center gap-0.5">
			{PHASE_ORDER.map((phase) => {
				const record = phaseMap.get(phase)
				const status = record?.status || "pending"

				return (
					<Tooltip key={phase}>
						<TooltipTrigger asChild>
							<div
								className={cn(
									"w-2 h-2 rounded-full transition-all",
									status === "completed" && "bg-success",
									status === "in_progress" && "bg-primary animate-pulse",
									status === "failed" && "bg-destructive",
									status === "skipped" && "bg-muted",
									status === "pending" && "bg-border",
								)}
							/>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs">
							{PHASE_DISPLAY_NAMES[phase]}: {status.replace("_", " ")}
						</TooltipContent>
					</Tooltip>
				)
			})}
		</div>
	)
}
