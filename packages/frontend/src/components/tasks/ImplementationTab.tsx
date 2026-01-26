import {
	Code2,
	Loader2,
	Play,
	Server,
	Settings2,
	StopCircle,
	Terminal,
} from "lucide-react"
import { useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useStartPhaseExecution } from "@/hooks/useGatewayCommand"
import type { TaskId, TaskPhaseDoc } from "@/types"
import { PhaseConfigPanel } from "./PhaseConfigPanel"
import { PhaseStatusHeader } from "./PhaseStatusHeader"

interface ImplementationTabProps {
	taskId: TaskId
	implementationPhase: TaskPhaseDoc | null
	activeContainerId?: string
}

export function ImplementationTab({
	taskId,
	implementationPhase,
	activeContainerId,
}: ImplementationTabProps) {
	const toast = useToast()
	const [showConfig, setShowConfig] = useState(false)
	const [isStarting, setIsStarting] = useState(false)
	const startPhaseCmd = useStartPhaseExecution()

	const status = implementationPhase?.status || "pending"
	const isPending = status === "pending"
	const isInProgress = status === "in_progress"
	const isCompleted = status === "completed" || status === "skipped"
	const isFailed = status === "failed"

	const handleStartImplementation = async () => {
		if (!activeContainerId) {
			toast.error(
				"No container",
				"Please assign a container to this task first",
			)
			return
		}
		setIsStarting(true)
		try {
			// Call container to start phase execution via Convex
			const _result = await startPhaseCmd.execute({
				containerId: activeContainerId,
				taskId: taskId as string,
				phase: "implementation",
			})

			toast.success(
				"Implementation started",
				`Agent running on container ${activeContainerId}`,
			)
		} catch (error) {
			toast.error(
				"Failed to start",
				error instanceof Error
					? error.message
					: "Failed to start implementation phase",
			)
		} finally {
			setIsStarting(false)
		}
	}

	return (
		<div className="space-y-8">
			<PhaseStatusHeader
				phase="implementation"
				phaseRecord={implementationPhase}
				onViewConfig={() => setShowConfig(true)}
			/>

			{isPending && (
				<section>
					<div className="bg-surface border border-border rounded-lg p-6 text-center">
						<Code2
							size={48}
							className="mx-auto mb-4 text-muted-foreground opacity-50"
						/>
						<h4 className="text-lg font-medium text-foreground mb-2">
							Ready to Start Implementation
						</h4>
						<p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
							The implementation agent will write code based on the planning
							output, create commits, and open a pull request when complete.
						</p>
						<div className="flex items-center justify-center gap-3">
							<Button onClick={handleStartImplementation} disabled={isStarting}>
								{isStarting ? (
									<>
										<Loader2 size={16} className="mr-2 animate-spin" />
										Starting...
									</>
								) : (
									<>
										<Play size={16} className="mr-2" />
										Start Implementation
									</>
								)}
							</Button>
							<Button variant="outline" onClick={() => setShowConfig(true)}>
								<Settings2 size={16} className="mr-2" />
								Configure
							</Button>
						</div>
					</div>
				</section>
			)}

			{isInProgress && (
				<>
					<section>
						<div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
							<div className="flex items-center justify-center gap-3 mb-4">
								<Loader2 size={24} className="animate-spin text-primary" />
								<span className="text-lg font-medium text-foreground">
									Implementation in Progress
								</span>
							</div>
							<p className="text-sm text-muted-foreground text-center">
								The agent is writing code and making changes. A pull request
								will be created when complete.
							</p>
							<div className="flex items-center justify-center gap-3 mt-4">
								<Button variant="outline" size="sm">
									<StopCircle size={16} className="mr-2" />
									Stop Agent
								</Button>
							</div>
						</div>
					</section>

					{activeContainerId && (
						<section>
							<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
								<Server size={16} className="mr-2" /> Active Container
							</h3>
							<div className="bg-surface border border-border rounded-lg p-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="w-2 h-2 rounded-full bg-success animate-pulse" />
										<code className="text-sm font-mono text-foreground">
											{activeContainerId}
										</code>
									</div>
									<Badge variant="default" className="uppercase">
										Running
									</Badge>
								</div>
							</div>
						</section>
					)}

					{implementationPhase?.agentSessionId && (
						<section>
							<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
								<Terminal size={16} className="mr-2" /> Agent Session
							</h3>
							<div className="bg-background border border-border rounded-lg p-4 max-h-96 overflow-y-auto">
								<pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
									Session: {implementationPhase.agentSessionId}
									{"\n"}Waiting for agent output...
								</pre>
							</div>
						</section>
					)}
				</>
			)}

			{isCompleted && (
				<section>
					<div className="bg-success/5 border border-success/20 rounded-lg p-6 text-center">
						<Code2 size={48} className="mx-auto mb-4 text-success" />
						<h4 className="text-lg font-medium text-foreground mb-2">
							Implementation Complete
						</h4>
						<p className="text-sm text-muted-foreground max-w-md mx-auto">
							The agent has completed the implementation. View the code changes
							in the Diff tab or proceed to review the Pull Request.
						</p>
					</div>
				</section>
			)}

			{isFailed && (
				<section>
					<div className="bg-destructive/5 border border-destructive/20 rounded-lg p-6">
						<div className="flex items-start gap-4">
							<Code2
								size={24}
								className="text-destructive flex-shrink-0 mt-1"
							/>
							<div className="flex-1">
								<h4 className="text-lg font-medium text-foreground mb-2">
									Implementation Failed
								</h4>
								{implementationPhase?.error && (
									<div className="bg-background border border-border rounded-lg p-3 mt-3">
										<pre className="text-xs font-mono text-destructive whitespace-pre-wrap">
											{implementationPhase.error}
										</pre>
									</div>
								)}
								<div className="flex items-center gap-3 mt-4">
									<Button
										onClick={handleStartImplementation}
										disabled={isStarting}
									>
										{isStarting ? (
											<>
												<Loader2 size={16} className="mr-2 animate-spin" />
												Retrying...
											</>
										) : (
											<>
												<Play size={16} className="mr-2" />
												Retry Implementation
											</>
										)}
									</Button>
								</div>
							</div>
						</div>
					</div>
				</section>
			)}

			{implementationPhase?.result && (
				<section>
					<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
						<Terminal size={16} className="mr-2" /> Agent Output
					</h3>
					<div className="bg-background border border-border rounded-lg p-4 max-h-64 overflow-y-auto">
						<pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
							{implementationPhase.result}
						</pre>
					</div>
				</section>
			)}

			<PhaseConfigPanel
				taskId={taskId}
				phase="implementation"
				isOpen={showConfig}
				onClose={() => setShowConfig(false)}
				readOnly={!isPending}
			/>
		</div>
	)
}
