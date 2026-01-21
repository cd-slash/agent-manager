import { api } from "@agent-manager/convex/api"
import { useMutation } from "convex/react"
import {
	Activity,
	CheckSquare,
	ChevronDown,
	ChevronRight,
	FileText,
	Loader2,
	Play,
	Settings2,
} from "lucide-react"
import { useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { TaskId, TaskPhaseDoc } from "@/types"
import { PhaseConfigPanel } from "./PhaseConfigPanel"
import { PhaseStatusHeader } from "./PhaseStatusHeader"

// Flexible types that work with both legacy types (id) and Convex Doc types (_id)
interface AcceptanceCriteriaItem {
	_id?: string
	id?: string
	text: string
	done: boolean
}

interface TestItem {
	_id?: string
	id?: string
	name: string
	status: "passed" | "pending" | "failed"
}

interface PlanningTabProps {
	taskId: TaskId
	planningPhase: TaskPhaseDoc | null
	acceptanceCriteria: AcceptanceCriteriaItem[]
	tests: TestItem[]
	implementationPrompt?: string
}

export function PlanningTab({
	taskId,
	planningPhase,
	acceptanceCriteria,
	tests,
	implementationPrompt,
}: PlanningTabProps) {
	const toast = useToast()
	const [showConfig, setShowConfig] = useState(false)
	const [showPrompt, setShowPrompt] = useState(false)
	const [isStarting, setIsStarting] = useState(false)

	const startPhase = useMutation(api.taskPhases.startPhase)

	const status = planningPhase?.status || "pending"
	const isPending = status === "pending"
	const isInProgress = status === "in_progress"
	const isCompleted = status === "completed" || status === "skipped"

	const handleStartPlanning = async () => {
		setIsStarting(true)
		try {
			await startPhase({
				taskId,
				phase: "planning",
			})
			toast.success(
				"Planning started",
				"The planning agent has begun analyzing the task",
			)
		} catch (error) {
			toast.error(
				"Failed to start",
				error instanceof Error
					? error.message
					: "Failed to start planning phase",
			)
		} finally {
			setIsStarting(false)
		}
	}

	return (
		<div className="space-y-8">
			<PhaseStatusHeader
				phase="planning"
				phaseRecord={planningPhase}
				onViewConfig={() => setShowConfig(true)}
			/>

			{isPending && (
				<section>
					<div className="bg-surface border border-border rounded-lg p-6 text-center">
						<FileText
							size={48}
							className="mx-auto mb-4 text-muted-foreground opacity-50"
						/>
						<h4 className="text-lg font-medium text-foreground mb-2">
							Ready to Start Planning
						</h4>
						<p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
							The planning agent will analyze the task requirements and generate
							acceptance criteria, implementation prompt, and test cases.
						</p>
						<div className="flex items-center justify-center gap-3">
							<Button onClick={handleStartPlanning} disabled={isStarting}>
								{isStarting ? (
									<>
										<Loader2 size={16} className="mr-2 animate-spin" />
										Starting...
									</>
								) : (
									<>
										<Play size={16} className="mr-2" />
										Start Planning
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
				<section>
					<div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
						<div className="flex items-center justify-center gap-3 mb-4">
							<Loader2 size={24} className="animate-spin text-primary" />
							<span className="text-lg font-medium text-foreground">
								Planning in Progress
							</span>
						</div>
						<p className="text-sm text-muted-foreground text-center">
							The planning agent is analyzing the task requirements. This may
							take a few minutes.
						</p>
					</div>
				</section>
			)}

			{isCompleted && (
				<>
					<section>
						<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
							<CheckSquare size={16} className="mr-2" /> Generated Acceptance
							Criteria
						</h3>
						<div className="bg-surface border border-border rounded-lg overflow-hidden">
							{acceptanceCriteria.length === 0 ? (
								<div className="p-4 text-sm text-muted-foreground">
									No acceptance criteria generated. Run the planning phase to
									generate criteria.
								</div>
							) : (
								acceptanceCriteria.map((criteria) => (
									<div
										key={criteria._id || criteria.id}
										className="flex items-center justify-between p-3 border-b border-border last:border-0 hover:bg-surface-elevated/50"
									>
										<div className="flex items-center min-w-0 flex-1">
											<div
												className={`w-2 h-2 rounded-full mr-3 flex-shrink-0 ${
													criteria.done ? "bg-success" : "bg-muted"
												}`}
											/>
											<span
												className={`text-sm truncate ${
													criteria.done
														? "text-muted-foreground line-through"
														: "text-foreground"
												}`}
											>
												{criteria.text}
											</span>
										</div>
										<Badge
											variant={criteria.done ? "default" : "secondary"}
											className="uppercase flex-shrink-0 ml-2"
										>
											{criteria.done ? "Done" : "Pending"}
										</Badge>
									</div>
								))
							)}
						</div>
					</section>

					<section>
						<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
							<Activity size={16} className="mr-2" /> Generated Test Cases
						</h3>
						<div className="bg-surface border border-border rounded-lg overflow-hidden">
							{tests.length === 0 ? (
								<div className="p-4 text-sm text-muted-foreground">
									No test cases generated. Run the planning phase to generate
									tests.
								</div>
							) : (
								tests.map((test) => (
									<div
										key={test._id || test.id}
										className="flex items-center justify-between p-3 border-b border-border last:border-0 hover:bg-surface-elevated/50"
									>
										<div className="flex items-center min-w-0 flex-1">
											<div
												className={`w-2 h-2 rounded-full mr-3 flex-shrink-0 ${
													test.status === "passed"
														? "bg-success"
														: test.status === "failed"
															? "bg-destructive"
															: "bg-muted"
												}`}
											/>
											<span className="text-sm font-mono truncate text-foreground">
												{test.name}
											</span>
										</div>
										<Badge
											variant={
												test.status === "passed"
													? "default"
													: test.status === "failed"
														? "destructive"
														: "secondary"
											}
											className="uppercase flex-shrink-0 ml-2"
										>
											{test.status}
										</Badge>
									</div>
								))
							)}
						</div>
					</section>

					{implementationPrompt && (
						<section>
							<button
								onClick={() => setShowPrompt(!showPrompt)}
								className="w-full text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center hover:text-foreground transition-colors"
							>
								{showPrompt ? (
									<ChevronDown size={16} className="mr-2" />
								) : (
									<ChevronRight size={16} className="mr-2" />
								)}
								<FileText size={16} className="mr-2" /> Implementation Prompt
								(Generated)
							</button>
							{showPrompt && (
								<div className="bg-surface border border-border rounded-lg p-4">
									<pre className="text-sm font-mono text-foreground whitespace-pre-wrap overflow-x-auto">
										{implementationPrompt}
									</pre>
								</div>
							)}
						</section>
					)}
				</>
			)}

			{planningPhase?.result && (
				<section>
					<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
						Agent Output
					</h3>
					<div className="bg-background border border-border rounded-lg p-4 max-h-64 overflow-y-auto">
						<pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
							{planningPhase.result}
						</pre>
					</div>
				</section>
			)}

			<PhaseConfigPanel
				taskId={taskId}
				phase="planning"
				isOpen={showConfig}
				onClose={() => setShowConfig(false)}
				readOnly={!isPending}
			/>
		</div>
	)
}
