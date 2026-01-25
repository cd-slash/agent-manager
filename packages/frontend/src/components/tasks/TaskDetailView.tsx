import { api } from "@agent-manager/convex/api"
import type { Id } from "@agent-manager/convex/dataModel"
import { useMutation, useQuery } from "convex/react"
import {
	Activity,
	AlertTriangle,
	ArrowRight,
	Bot,
	CheckCircle2,
	CheckSquare,
	ChevronDown,
	ChevronRight,
	ClipboardList,
	FileText,
	GitMerge,
	GitPullRequest,
	Globe,
	History,
	Layout,
	Link as LinkIcon,
	MessageSquare,
	Plus,
	Terminal,
	ThumbsUp,
	User,
	UserCheck,
	Wrench,
	X,
	XCircle,
} from "lucide-react"
import { useState, useEffect, useMemo, useRef } from "react"
import { AgentChatPanel, type Provider, type Model, type AgentStatus } from "@/components/chat/AgentChatPanel"
import { DependencyPickerModal } from "@/components/modals/DependencyPickerModal"
import { useCreateContainer } from "@/hooks/useGatewayCommand"
import { useToast } from "@/components/ToastProvider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
	ChatMessage,
	ChatMessagePart,
	Project,
	Task,
	TaskPhase,
	TaskPhaseDoc,
} from "@/types"
import { ImplementationTab } from "./ImplementationTab"
import { PhaseTimeline } from "./PhaseTimeline"
import { PlanningTab } from "./PlanningTab"
import { RemediationTab } from "./RemediationTab"

// Helper to format timestamps
const formatTime = (timestamp: number): string => {
	const now = Date.now()
	const diff = now - timestamp
	const minutes = Math.floor(diff / 60000)
	const hours = Math.floor(diff / 3600000)
	const days = Math.floor(diff / 86400000)

	if (minutes < 1) return "Just now"
	if (minutes < 60) return `${minutes}m ago`
	if (hours < 24) return `${hours}h ago`
	return `${days}d ago`
}

interface TaskDetailViewProps {
	task: Task
	project?: Project
	onUpdate: (task: Task) => void
}

// Type for PR issues from Convex
interface PrIssue {
	_id: string
	severity: "error" | "warning" | "info"
	title: string
	description: string
	filePath: string
	lineNumber?: number
	suggestion?: string
	resolved: boolean
}

export function TaskDetailView({
	task,
	project,
	onUpdate,
}: TaskDetailViewProps) {
	const [activeTab, setActiveTab] = useState("chat")
	const [openFiles, setOpenFiles] = useState<Record<string, boolean>>({})
	const [showDependencyPicker, setShowDependencyPicker] = useState(false)
	const toast = useToast()

	// Get the Convex task ID
	const taskId = task.id as Id<"tasks">

	// Fetch task phases from Convex
	const phases = useQuery(api.taskPhases.listByTask, { taskId }) ?? []

	// Fetch task template for this task
	const taskTemplate = useQuery(api.taskTemplates.getForTask, { taskId })

	// Fetch PR data for this task
	const pullRequest = useQuery(api.pullRequests.getByTask, { taskId })

	// Fetch PR issues if we have a PR
	const prIssues = useQuery(
		api.pullRequests.listIssues,
		pullRequest?._id ? { pullRequestId: pullRequest._id } : "skip",
	) as PrIssue[] | undefined

	// Set of phases that are applicable to this task (from the template)
	const applicablePhases = new Set(phases.map((p) => p.phase))

	// Helper to check if a phase is applicable to this task
	const isPhaseApplicable = (phaseName: TaskPhase): boolean => {
		return applicablePhases.has(phaseName)
	}

	// Helper to get tab styling based on phase applicability
	const getTabClassName = (phaseName: TaskPhase): string => {
		const baseClass = "flex items-center"
		if (!isPhaseApplicable(phaseName)) {
			return `${baseClass} opacity-40`
		}
		return baseClass
	}

	// Helper to get phase by name
	const getPhaseByName = (phaseName: TaskPhase): TaskPhaseDoc | null => {
		return (
			(phases.find((p) => p.phase === phaseName) as TaskPhaseDoc | undefined) ??
			null
		)
	}

	// Track if agent is currently processing
	const [isAgentProcessing, setIsAgentProcessing] = useState(false)
	const [isCreatingContainer, setIsCreatingContainer] = useState(false)
	// Track the current streaming session - only used during active execution for real-time display
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
	// Track Claude's session ID for resumption (persisted to task)
	const [activeSessionId, setActiveSessionId] = useState<string | null>(
		task.activeSessionId ?? null
	)

	// Fetch chat messages from Convex - this is the persistent history
	const chatMessagesData = useQuery(api.chat.listByTask, { taskId }) ?? []

	// Subscribe to streaming messages only during active execution
	const streamingMessages = useQuery(
		api.agentMessages.getBySession,
		currentSessionId ? { sessionId: currentSessionId } : "skip"
	)

	// Query to watch container pool for task's container
	const taskContainer = useQuery(
		api.containerPool.get,
		task.activeContainerId ? { containerId: task.activeContainerId } : "skip"
	)

	// Compute agent status based on current state
	const agentStatus: AgentStatus = useMemo(() => {
		if (!isAgentProcessing) return "idle"
		if (isCreatingContainer && !task.activeContainerId) return "waiting_for_container"
		if (isCreatingContainer && task.activeContainerId && taskContainer?.status !== "online") return "starting_container"
		if (isCreatingContainer && taskContainer?.status === "online") return "container_ready"
		return "thinking"
	}, [isAgentProcessing, isCreatingContainer, task.activeContainerId, taskContainer?.status])

	// Helper functions for formatting tool displays
	const formatToolDisplay = (name: string, input: unknown): string => {
		if (input && typeof input === "object") {
			const inp = input as Record<string, unknown>
			if ("command" in inp && typeof inp.command === "string")
				return inp.command.slice(0, 60)
			if ("file_path" in inp && typeof inp.file_path === "string")
				return inp.file_path
			if ("pattern" in inp && typeof inp.pattern === "string") return inp.pattern
		}
		return ""
	}

	const formatToolInput = (input: unknown): string => {
		if (typeof input === "string") return input
		if (input && typeof input === "object") {
			return JSON.stringify(input, null, 2)
		}
		return ""
	}

	// Track the message count when streaming started to detect new messages
	// Defined early so it can be used in chatHistory useMemo
	const messageCountBeforeStreaming = useRef<number | null>(null)

	// Watch streaming messages for completion and extract structured content
	const streamingContent = useMemo(() => {
		if (!streamingMessages || streamingMessages.length === 0) return null

		const parts: ChatMessagePart[] = []
		const toolResults = new Map<string, { content: string; isError: boolean }>()
		let hasResult = false
		let finalResultText: string | null = null

		// First pass: collect tool results
		for (const msg of streamingMessages) {
			try {
				const content = msg.rawContent ? JSON.parse(msg.rawContent) : null
				if (!content) continue

				if (content.type === "tool_result" && content.tool_use_id) {
					const resultText =
						content.content?.[0]?.text ||
						(typeof content.content === "string" ? content.content : null) ||
						"No output"
					toolResults.set(content.tool_use_id, {
						content:
							typeof resultText === "string"
								? resultText.slice(0, 500)
								: "No output", // Truncate long results
						isError: content.is_error ?? false,
					})
				}
			} catch {
				// Skip parse errors
			}
		}

		// Second pass: build parts with attached results
		for (const msg of streamingMessages) {
			try {
				const content = msg.rawContent ? JSON.parse(msg.rawContent) : null
				if (!content) continue

				if (content.type === "result") {
					hasResult = true
					finalResultText = content.result
					continue
				}

				if (content.type === "assistant" && content.message?.content) {
					for (const block of content.message.content) {
						if (block.type === "text" && block.text) {
							parts.push({ type: "text", content: block.text })
						} else if (block.type === "tool_use") {
							const toolId = block.id
							parts.push({
								type: "tool_use",
								content: formatToolDisplay(block.name, block.input),
								toolName: block.name || "unknown",
								toolInput: formatToolInput(block.input),
								toolId,
								result: toolResults.get(toolId), // Attach result if available
							})
						}
					}
				}
			} catch {
				// Skip parse errors
			}
		}

		// Add final result as text part if present
		if (finalResultText) {
			parts.push({ type: "text", content: finalResultText })
		}

		return { parts, hasResult }
	}, [streamingMessages])

	// Convert Convex chat messages to the UI format, adding streaming message if active
	const chatHistory: ChatMessage[] = useMemo(() => {
		const messages: ChatMessage[] = chatMessagesData.map((msg) => ({
			id: msg._id,
			sender: msg.sender,
			text: msg.text,
			time: formatTime(msg.createdAt),
			model: msg.model,
			provider: msg.provider,
		}))

		// Show streaming content with structure during active processing
		// Use currentSessionId (not isAgentProcessing) to keep showing content until
		// the session is fully cleared, preventing a gap when transitioning from
		// streaming to the persisted message
		//
		// IMPORTANT: Don't show streaming message if the persisted AI message has already
		// arrived in chatMessagesData. This prevents duplicate messages in the UI.
		const baselineCount = messageCountBeforeStreaming.current
		const hasPersistedAiMessage = baselineCount !== null &&
			chatMessagesData.length > baselineCount &&
			chatMessagesData.some((msg, idx) => idx >= baselineCount && msg.sender === "ai")

		if (streamingContent?.parts.length && currentSessionId && !hasPersistedAiMessage) {
			messages.push({
				id: "streaming-" + currentSessionId,
				sender: "ai",
				text: "", // Will use parts instead
				parts: streamingContent.parts,
				time: "streaming...",
				isStreaming: !streamingContent.hasResult, // false when complete
			})
		}

		return messages
	}, [chatMessagesData, streamingContent, currentSessionId])

	// Mutation to send messages
	const sendMessage = useMutation(api.chat.sendTaskMessage)

	// Mutation to start agent execution
	const startExecution = useMutation(api.containerCommands.startExecution)

	// Mutation to update task (for assigning container)
	const updateTask = useMutation(api.tasks.update)

	// Hook for creating containers with proper error handling
	const createContainer = useCreateContainer()

	// Mutation to push auth token to container
	const pushAuthToken = useMutation(api.containerCommands.pushAuthToken)

	// Convex mutations for dependencies
	const addDependency = useMutation(api.tasks.addDependency)
	const removeDependency = useMutation(api.tasks.removeDependency)

	const handleAddDependency = async (depId: string) => {
		try {
			const dependsOnTaskId = depId as Id<"tasks">
			await addDependency({ taskId, dependsOnTaskId })
			toast.success("Dependency added", "Task dependency has been added")
		} catch (error) {
			toast.error(
				"Failed to add dependency",
				error instanceof Error ? error.message : "Could not add dependency",
			)
		}
	}

	const handleRemoveDependency = async (depId: string) => {
		try {
			const dependsOnTaskId = depId as Id<"tasks">
			await removeDependency({ taskId, dependsOnTaskId })
			toast.success("Dependency removed", "Task dependency has been removed")
		} catch (error) {
			toast.error(
				"Failed to remove dependency",
				error instanceof Error ? error.message : "Could not remove dependency",
			)
		}
	}

	const toggleFile = (filename: string) =>
		setOpenFiles((prev) => ({ ...prev, [filename]: !prev[filename] }))

	const handleCreatePR = () => {
		const updatedTask = {
			...task,
			prCreated: true,
			prNumber: Math.floor(Math.random() * 1000) + 4000,
			prStatus: "open",
		}
		onUpdate(updatedTask)
		setActiveTab("pr")
	}

	// Store pending message when waiting for container
	const [pendingMessage, setPendingMessage] = useState<string | null>(null)

	// Provider and model state for chat
	const [selectedProvider, setSelectedProvider] = useState<Provider>("anthropic")
	const [selectedModel, setSelectedModel] = useState<Model>("opus")

	// Fetch ZAI API key for when ZAI provider is selected
	const zaiApiKey = useQuery(api.secrets.get, { key: "ZAI_API_KEY" })

	// When container becomes available and we have a pending message, execute it
	// Convex automatically syncs task.activeContainerId when the backend sets it
	useEffect(() => {
		if (task.activeContainerId && pendingMessage) {
			// Use the stored provider and model from state (set before pending message)
			// New container means new session (no sessionId to resume)
			executeWithContainer(task.activeContainerId, pendingMessage, selectedProvider, selectedModel, null)
			setPendingMessage(null)
			setIsCreatingContainer(false)
		}
	}, [task.activeContainerId, pendingMessage, selectedProvider, selectedModel])

	// Sync activeSessionId from task when it changes (e.g., from backend update)
	useEffect(() => {
		if (task.activeSessionId !== activeSessionId) {
			setActiveSessionId(task.activeSessionId ?? null)
		}
	}, [task.activeSessionId])

	// Set the baseline message count when streaming starts
	useEffect(() => {
		if (currentSessionId && messageCountBeforeStreaming.current === null) {
			messageCountBeforeStreaming.current = chatMessagesData.length
		}
		if (!currentSessionId) {
			messageCountBeforeStreaming.current = null
		}
	}, [currentSessionId, chatMessagesData.length])

	// Clear processing state when streaming completes (result message received)
	useEffect(() => {
		if (streamingContent?.hasResult && isAgentProcessing) {
			setIsAgentProcessing(false)
		}
	}, [streamingContent?.hasResult, isAgentProcessing])

	// Clear session only when the persisted AI message appears in chatMessagesData
	// This prevents a gap between streaming and persisted message
	useEffect(() => {
		if (!streamingContent?.hasResult || !currentSessionId) return
		if (messageCountBeforeStreaming.current === null) return

		// Check if a new AI message has appeared since streaming started
		const hasNewAiMessage = chatMessagesData.length > messageCountBeforeStreaming.current &&
			chatMessagesData.some((msg, idx) =>
				idx >= messageCountBeforeStreaming.current! && msg.sender === "ai"
			)

		if (hasNewAiMessage) {
			setCurrentSessionId(null)
			return
		}

		// Fallback: clear after 5 seconds if persisted message never arrives
		// This prevents streaming message from staying forever on network failures
		const fallbackTimer = setTimeout(() => {
			setCurrentSessionId(null)
		}, 5000)

		return () => clearTimeout(fallbackTimer)
	}, [streamingContent?.hasResult, currentSessionId, chatMessagesData])

	const executeWithContainer = async (containerId: string, message: string, provider: Provider, model: Model, sessionIdToResume?: string | null) => {
		setIsAgentProcessing(true)
		setCurrentSessionId(null) // Reset session before starting new one
		try {
			// Push auth token first
			const authToken = "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"
			await pushAuthToken({
				containerId,
				token: authToken,
			})

			// Build environment variables based on provider
			let envVars: {
				ANTHROPIC_AUTH_TOKEN?: string
				ANTHROPIC_BASE_URL?: string
				API_TIMEOUT_MS?: string
			} | undefined

			if (provider === "zai") {
				if (!zaiApiKey?.value) {
					toast.error("ZAI API Key Missing", "Please configure your ZAI API key in Settings > Providers")
					setIsAgentProcessing(false)
					return
				}
				envVars = {
					ANTHROPIC_AUTH_TOKEN: zaiApiKey.value,
					ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
					API_TIMEOUT_MS: "3000000",
				}
			}
			// For anthropic provider, envVars is undefined (use default env)

			const result = await startExecution({
				containerId,
				message,
				model,
				provider,
				envVars,
				taskId: taskId as string,
				projectId: task.projectId as string,
				sessionId: sessionIdToResume ?? undefined, // Resume Claude session if provided
			})

			// Track the session for streaming updates
			if (result?.correlationId) {
				setCurrentSessionId(result.correlationId)
			}
		} catch (error) {
			console.error("Failed to start agent execution:", error)
			toast.error("Agent error", "Failed to start agent execution")
			setIsAgentProcessing(false)
		}
		// Note: isAgentProcessing will be cleared by the useEffect watching streamingMessages
	}

	// Mutation to clear session for starting fresh
	const clearActiveSession = useMutation(api.tasks.clearActiveSession)

	const handleNewSession = async () => {
		try {
			await clearActiveSession({ taskId })
			setActiveSessionId(null)
			toast.info("Session cleared", "Next message will start a fresh conversation")
		} catch (error) {
			console.error("Failed to clear session:", error)
			toast.error("Error", "Failed to clear session")
		}
	}

	const handleSendMessage = async (text: string, provider: Provider, model: Model) => {
		// Update selected provider/model state
		setSelectedProvider(provider)
		setSelectedModel(model)

		// Send user message to Convex
		await sendMessage({
			taskId,
			text,
			sender: "user",
		})

		// Check if we have a container assigned
		const containerId = task.activeContainerId

		// If we have an active session, we MUST use the same container
		if (activeSessionId && task.activeContainerId) {
			// Verify container is available
			if (!taskContainer || taskContainer.status === "offline") {
				toast.error(
					"Session container unavailable",
					"The container for this session is offline. Click 'New Session' to start fresh."
				)
				setIsAgentProcessing(false)
				return
			}
			// Resume session on the same container
			await executeWithContainer(task.activeContainerId, text, provider, model, activeSessionId)
		} else if (containerId) {
			// Container exists but no session - start new session
			await executeWithContainer(containerId, text, provider, model)
		} else {
			// No container assigned, create a new one
			setIsCreatingContainer(true)
			setIsAgentProcessing(true)
			setPendingMessage(text)
			toast.info("Creating container", "Spinning up a new container for this task...")

			try {
				console.log("[TaskDetailView] Creating container with:", {
					taskId: taskId,
					projectId: task.projectId,
					repo: project?.repo,
					branch: project?.branch,
				})

				// Use the hook's execute method which watches for command completion/failure
				const result = await createContainer.execute({
					taskId: taskId as string,
					projectId: task.projectId as string,
					containerType: "agent",
					repo: project?.repo,
					branch: project?.branch,
				})
				// Container creation succeeded - show confirmation toast
				toast.success("Container created", <>Container <code className="bg-background px-1 py-0.5 rounded text-xs font-mono">{result.name}</code> is ready</>)
				// The backend will assign activeContainerId which will trigger the useEffect above
			} catch (error) {
				console.error("Failed to create container:", error)
				// Show the actual error message from the gateway
				const errorMessage = error instanceof Error ? error.message : "Failed to create container for task"
				toast.error("Container creation failed", errorMessage)
				setIsAgentProcessing(false)
				setIsCreatingContainer(false)
				setPendingMessage(null)
			}
		}
	}

	return (
		<div className="flex flex-col h-full bg-background animate-in fade-in duration-300">
			<div className="flex-1 flex overflow-hidden">
				<div className="flex-1 overflow-y-auto min-w-0">
					<div className="px-page pt-section shrink-0">
						<Tabs value={activeTab} onValueChange={setActiveTab}>
							<TabsList className="w-full justify-start">
								<TabsTrigger value="chat" className="flex items-center">
									<MessageSquare size={14} className="mr-1.5" />
									Chat
								</TabsTrigger>
								<TabsTrigger value="status" className="flex items-center">
									<Activity size={14} className="mr-1.5" />
									Status
								</TabsTrigger>
								{/* Phase tabs with tooltips for non-applicable phases */}
								{([
									{ value: "requirements", phase: "requirements" as TaskPhase, label: "Requirements", icon: ClipboardList },
									{ value: "planning", phase: "planning" as TaskPhase, label: "Planning", icon: FileText },
									{ value: "implementation", phase: "implementation" as TaskPhase, label: "Implementation", icon: Terminal },
								]).map(({ value, phase, label, icon: Icon }) => {
									const isApplicable = isPhaseApplicable(phase)
									return (
										<Tooltip key={value}>
											<TooltipTrigger asChild>
												<span>
													<TabsTrigger
														value={value}
														disabled={!isApplicable}
														className={getTabClassName(phase)}
													>
														<Icon size={14} className="mr-1.5" />
														{label}
													</TabsTrigger>
												</span>
											</TooltipTrigger>
											{!isApplicable && (
												<TooltipContent side="bottom">
													<p className="text-xs">{label} is not applicable to {taskTemplate?.name || "this task type"}</p>
												</TooltipContent>
											)}
										</Tooltip>
									)
								})}
								<TabsTrigger value="pr" className="flex items-center">
									<GitPullRequest size={14} className="mr-1.5" />
									Pull Request
								</TabsTrigger>
								{([
									{ value: "ai-review", phase: "ai_review" as TaskPhase, label: "AI Review", icon: Bot },
									{ value: "remediation", phase: "remediation" as TaskPhase, label: "Remediation", icon: Wrench },
									{ value: "human-review", phase: "human_review" as TaskPhase, label: "Human Review", icon: UserCheck },
									{ value: "merge", phase: "merge" as TaskPhase, label: "Merge", icon: GitMerge },
								]).map(({ value, phase, label, icon: Icon }) => {
									const isApplicable = isPhaseApplicable(phase)
									return (
										<Tooltip key={value}>
											<TooltipTrigger asChild>
												<span>
													<TabsTrigger
														value={value}
														disabled={!isApplicable}
														className={getTabClassName(phase)}
													>
														<Icon size={14} className="mr-1.5" />
														{label}
													</TabsTrigger>
												</span>
											</TooltipTrigger>
											{!isApplicable && (
												<TooltipContent side="bottom">
													<p className="text-xs">{label} is not applicable to {taskTemplate?.name || "this task type"}</p>
												</TooltipContent>
											)}
										</Tooltip>
									)
								})}
								<TabsTrigger value="diff" className="flex items-center">
									<GitPullRequest size={14} className="mr-1.5" />
									Diff
								</TabsTrigger>
							</TabsList>

							<TabsContent value="chat" className="!mt-0 pt-6">
								<div className="flex gap-6 h-[calc(100vh-12rem)]">
									{/* Phase sidebar */}
									<div className="w-48 shrink-0 bg-surface border border-border rounded-lg overflow-hidden">
										<div className="p-3 border-b border-border">
											<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phases</h4>
										</div>
										<div className="p-2 space-y-1">
											{([
												{ phase: "requirements" as TaskPhase, label: "Requirements", icon: ClipboardList },
												{ phase: "planning" as TaskPhase, label: "Planning", icon: FileText },
												{ phase: "implementation" as TaskPhase, label: "Implementation", icon: Terminal },
												{ phase: "ai_review" as TaskPhase, label: "AI Review", icon: Bot },
												{ phase: "remediation" as TaskPhase, label: "Remediation", icon: Wrench },
												{ phase: "human_review" as TaskPhase, label: "Human Review", icon: UserCheck },
												{ phase: "merge" as TaskPhase, label: "Merge", icon: GitMerge },
											]).map(({ phase, label, icon: Icon }) => {
												const phaseDoc = getPhaseByName(phase)
												const isActive = task.currentPhase === phase
												const isApplicable = isPhaseApplicable(phase)
												// Phase is "reached" if it has started (not pending) or is completed/failed/skipped
												const hasBeenReached = phaseDoc && phaseDoc.status !== "pending"
												const isEnabled = isActive || hasBeenReached

												// Determine tooltip message
												let tooltipMessage: string | null = null
												if (!isApplicable) {
													tooltipMessage = `${label} is not applicable to ${taskTemplate?.name || "this task type"}`
												} else if (!isEnabled) {
													tooltipMessage = `Task has not yet progressed to ${label}`
												}

												return (
													<Tooltip key={phase}>
														<TooltipTrigger asChild>
															<button
																type="button"
																onClick={() => isEnabled && setActiveTab(phase === "ai_review" ? "ai-review" : phase === "human_review" ? "human-review" : phase)}
																className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
																	isActive
																		? "bg-primary/10 text-primary"
																		: isEnabled
																			? "text-foreground hover:bg-surface-elevated"
																			: "text-muted-foreground/50"
																}`}
															>
																<Icon size={14} />
																<span className="truncate">{label}</span>
																{phaseDoc?.status === "completed" && (
																	<CheckCircle2 size={12} className="ml-auto text-green-500" />
																)}
																{phaseDoc?.status === "in_progress" && (
																	<div className="ml-auto w-2 h-2 rounded-full bg-feature-blue animate-pulse" />
																)}
															</button>
														</TooltipTrigger>
														{tooltipMessage && (
															<TooltipContent side="right">
																<p className="text-xs">{tooltipMessage}</p>
															</TooltipContent>
														)}
													</Tooltip>
												)
											})}
										</div>
									</div>

									{/* Chat panel - takes remaining space */}
									<div className="flex-1 min-w-0">
										<AgentChatPanel
											chatHistory={chatHistory}
											onSendMessage={handleSendMessage}
											isLoading={isAgentProcessing && !streamingContent?.parts.length}
											agentStatus={agentStatus}
											selectedProvider={selectedProvider}
											selectedModel={selectedModel}
											onProviderChange={setSelectedProvider}
											onModelChange={setSelectedModel}
											sessionId={activeSessionId}
											onNewSession={handleNewSession}
										/>
									</div>
								</div>
							</TabsContent>

							<div className="py-6">
								<div className="min-w-0">
									<TabsContent value="status" className="!mt-0">
										<div className="space-y-8">
											{phases.length > 0 && (
												<section>
													<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
														<Activity size={16} className="mr-2" /> Task
														Progress
													</h3>
													<div className="bg-surface border border-border rounded-lg p-4">
														<PhaseTimeline
															phases={phases as TaskPhaseDoc[]}
															currentPhase={
																task.currentPhase as TaskPhase | undefined
															}
															applicablePhases={applicablePhases}
															templateName={taskTemplate?.name}
															onPhaseClick={(phase) => {
																const phaseToTab: Record<TaskPhase, string> = {
																	requirements: "requirements",
																	planning: "planning",
																	implementation: "implementation",
																	ai_review: "ai-review",
																	remediation: "remediation",
																	human_review: "human-review",
																	merge: "merge",
																}
																setActiveTab(
																	phaseToTab[phase] || "requirements",
																)
															}}
														/>
													</div>
												</section>
											)}

											<section>
												<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
													<History size={16} className="mr-2" /> Activity
													History
												</h3>
												<div className="bg-surface border border-border rounded-lg p-4">
													{!task.history || task.history.length === 0 ? (
														<div className="text-sm text-muted-foreground">
															No activity recorded yet.
														</div>
													) : (
														<div className="relative border-l border-border ml-3 space-y-6">
															{task.history?.map((event) => (
																<div key={event.id} className="relative pl-6">
																	<div className="absolute -left-1.5 top-1.5 w-3 h-3 bg-surface-elevated border border-border rounded-full"></div>
																	<div className="text-sm text-foreground font-medium">
																		{event.action}
																	</div>
																	<div className="text-xs text-muted-foreground mt-1 flex items-center space-x-2">
																		<User size={12} />
																		<span>{event.user}</span>
																		<span className="w-1 h-1 bg-muted rounded-full"></span>
																		<span>{event.time}</span>
																	</div>
																</div>
															))}
														</div>
													)}
												</div>
											</section>
										</div>
									</TabsContent>

									<TabsContent value="requirements" className="!mt-0">
										<div className="space-y-8">
											<section>
												<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
													<Layout size={16} className="mr-2" /> Description
												</h3>
												<div className="bg-surface border border-border rounded-lg p-4 text-foreground leading-relaxed">
													{task.description}
												</div>
											</section>

											<section>
												<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center justify-between">
													<span className="flex items-center">
														<LinkIcon size={16} className="mr-2" /> Dependencies
													</span>
													<Button
														variant="outline"
														size="sm"
														onClick={() => setShowDependencyPicker(true)}
													>
														<Plus size={14} className="mr-1" />
														Add
													</Button>
												</h3>
												<div className="bg-surface border border-border rounded-lg overflow-hidden">
													{(!task.dependencies ||
														task.dependencies.length === 0) && (
														<div className="p-4 text-sm text-muted-foreground">
															No dependencies. Add tasks that must be completed
															before this one can start.
														</div>
													)}
													{task.dependencies?.map((depId) => {
														const depTask = project?.tasks.find(
															(t) => t.id === depId,
														)
														if (!depTask) return null
														return (
															<div
																key={depId}
																className="flex items-center justify-between p-3 border-b border-border last:border-0 hover:bg-surface-elevated/50 group"
															>
																<div className="flex items-center min-w-0 flex-1">
																	<div
																		className={`w-2 h-2 rounded-full mr-3 flex-shrink-0 ${
																			depTask.category === "done"
																				? "bg-green-500"
																				: "bg-muted"
																		}`}
																	></div>
																	<span
																		className={`text-sm truncate ${
																			depTask.category === "done"
																				? "text-muted-foreground line-through"
																				: "text-foreground"
																		}`}
																	>
																		{depTask.title}
																	</span>
																</div>
																<div className="flex items-center gap-2 flex-shrink-0">
																	<Badge
																		variant="secondary"
																		className="uppercase"
																	>
																		{depTask.category}
																	</Badge>
																	<button
																		type="button"
																		onClick={() =>
																			handleRemoveDependency(depId)
																		}
																		className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-all"
																		title="Remove dependency"
																	>
																		<X
																			size={14}
																			className="text-muted-foreground hover:text-destructive"
																		/>
																	</button>
																</div>
															</div>
														)
													})}
												</div>
											</section>

											<section>
												<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
													<Terminal size={16} className="mr-2" /> AI Prompt
												</h3>
												<div className="bg-surface border border-border rounded-lg p-4">
													<code className="text-sm font-mono text-feature-blue block">
														{task.prompt}
													</code>
												</div>
											</section>

											<section>
												<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
													<CheckSquare size={16} className="mr-2" /> Acceptance
													Criteria
												</h3>
												<div className="bg-surface border border-border rounded-lg overflow-hidden">
													{(!task.acceptanceCriteria ||
														task.acceptanceCriteria.length === 0) && (
														<div className="p-4 text-sm text-muted-foreground">
															No acceptance criteria defined.
														</div>
													)}
													{task.acceptanceCriteria?.map((criteria) => (
														<div
															key={criteria.id}
															className="flex items-center justify-between p-3 border-b border-border last:border-0 hover:bg-surface-elevated/50 group"
														>
															<div className="flex items-center min-w-0 flex-1">
																<div
																	className={`w-2 h-2 rounded-full mr-3 flex-shrink-0 ${
																		criteria.done ? "bg-green-500" : "bg-muted"
																	}`}
																></div>
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
																variant={
																	criteria.done ? "success" : "secondary"
																}
																className="uppercase flex-shrink-0"
															>
																{criteria.done ? "Done" : "Pending"}
															</Badge>
														</div>
													))}
												</div>
											</section>

											<section>
												<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
													<Activity size={16} className="mr-2" /> Tests
												</h3>
												<div className="bg-surface border border-border rounded-lg overflow-hidden">
													{(!task.tests || task.tests.length === 0) && (
														<div className="p-4 text-sm text-muted-foreground">
															No tests defined.
														</div>
													)}
													{task.tests?.map((test) => (
														<div
															key={test.id}
															className="flex items-center justify-between p-3 border-b border-border last:border-0 hover:bg-surface-elevated/50 group"
														>
															<div className="flex items-center min-w-0 flex-1">
																<div
																	className={`w-2 h-2 rounded-full mr-3 flex-shrink-0 ${
																		test.status === "passed"
																			? "bg-green-500"
																			: test.status === "failed"
																				? "bg-red-500"
																				: "bg-muted"
																	}`}
																></div>
																<span className="text-sm font-mono truncate text-foreground">
																	{test.name}
																</span>
															</div>
															<Badge
																variant={
																	test.status === "passed"
																		? "success"
																		: test.status === "failed"
																			? "destructive"
																			: "warning"
																}
																className="uppercase flex-shrink-0"
															>
																{test.status}
															</Badge>
														</div>
													))}
												</div>
											</section>
										</div>
									</TabsContent>

									<TabsContent value="planning" className="!mt-0">
										<PlanningTab
											taskId={taskId}
											planningPhase={getPhaseByName("planning")}
											acceptanceCriteria={task.acceptanceCriteria || []}
											tests={task.tests || []}
											implementationPrompt={task.implementationPrompt}
											activeContainerId={task.activeContainerId}
										/>
									</TabsContent>

									<TabsContent value="implementation" className="!mt-0">
										<ImplementationTab
											taskId={taskId}
											implementationPhase={getPhaseByName("implementation")}
											activeContainerId={task.activeContainerId}
										/>
									</TabsContent>

									<TabsContent value="pr" className="!mt-0">
										{!task.prCreated ? (
											<div className="flex flex-col items-center justify-center h-64 text-muted-foreground bg-surface/30 border border-border rounded-lg border-dashed">
												<GitPullRequest size={48} className="mb-4 opacity-50" />
												<p className="font-medium text-muted-foreground">
													No Pull Request created yet.
												</p>
												<button
													type="button"
													onClick={handleCreatePR}
													className="mt-4 text-feature-blue hover:text-feature-blue text-sm flex items-center hover:underline"
												>
													Create one from changes{" "}
													<ArrowRight size={14} className="ml-1" />
												</button>
											</div>
										) : (
											<div className="space-y-6">
												<div className="bg-surface border border-border rounded-lg p-6">
													<div className="mb-6">
														<div className="mb-3">
															<span className="text-xl font-bold text-foreground">
																#{task.prNumber} {task.title}
															</span>
														</div>
														<div className="text-sm text-muted-foreground flex items-center">
															<span className="font-mono bg-background border border-border px-2 py-0.5 rounded text-foreground text-xs">
																feature/task-{String(task.id).slice(-4)}
															</span>
															<ArrowRight
																size={14}
																className="mx-2 text-muted-foreground"
															/>
															<span className="font-mono bg-background border border-border px-2 py-0.5 rounded text-foreground text-xs">
																main
															</span>
															<Badge
																variant="success"
																className="ml-3 uppercase"
															>
																Open
															</Badge>
														</div>
													</div>
													<div className="flex justify-start space-x-3">
														<Button className="bg-green-600 hover:bg-green-500">
															<GitMerge size={16} className="mr-2" /> Merge Pull
															Request
														</Button>
														<Button variant="outline">
															<XCircle size={16} className="mr-2" /> Close Pull
															Request
														</Button>
													</div>
												</div>

												<div className="bg-surface border border-border rounded-lg overflow-hidden">
													<div className="p-4 border-b border-border font-semibold text-foreground">
														Checks
													</div>
													<div className="divide-y divide-border">
														<div className="p-4 flex items-center justify-between hover:bg-surface-elevated/30 transition-colors">
															<div className="flex items-center">
																<CheckCircle2
																	size={18}
																	className="text-green-400 mr-3"
																/>
																<span className="text-foreground">
																	CI Build
																</span>
															</div>
															<span className="text-xs text-green-400 font-medium">
																Passed
															</span>
														</div>
														<div className="p-4 flex items-center justify-between hover:bg-surface-elevated/30 transition-colors">
															<div className="flex items-center">
																<Bot
																	size={18}
																	className="text-feature-blue mr-3"
																/>
																<span className="text-foreground">
																	AI Code Review
																</span>
															</div>
															<span className="text-xs text-green-400 font-medium">
																Passed
															</span>
														</div>
														<div className="p-4 flex items-center justify-between hover:bg-surface-elevated/30 transition-colors">
															<div className="flex items-center">
																<Activity
																	size={18}
																	className="text-green-400 mr-3"
																/>
																<span className="text-foreground">
																	Unit Tests
																</span>
															</div>
															<span className="text-xs text-green-400 font-medium">
																3/3 Passed
															</span>
														</div>
													</div>
												</div>

												<div className="relative border-l border-border ml-3 space-y-6">
													<div className="relative pl-6">
														<div className="absolute -left-1.5 top-1.5 w-3 h-3 bg-surface-elevated border border-border rounded-full"></div>
														<div className="text-sm text-foreground font-medium">
															John Doe created this pull request
														</div>
														<div className="text-xs text-muted-foreground mt-1">
															Just now
														</div>
													</div>
												</div>

												<div className="bg-surface border border-border rounded-lg p-4">
													<h4 className="text-sm font-medium text-muted-foreground mb-3">
														Add a comment
													</h4>
													<div className="flex space-x-3">
														<div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-feature-blue text-xs font-bold shrink-0">
															ME
														</div>
														<div className="flex-1">
															<Textarea
																className="h-24 resize-none"
																placeholder="Leave a comment..."
															/>
															<div className="flex justify-end mt-2">
																<Button variant="outline" size="sm">
																	Comment
																</Button>
															</div>
														</div>
													</div>
												</div>
											</div>
										)}
									</TabsContent>

									<TabsContent value="ai-review" className="!mt-0">
										<div className="space-y-6">
											<div className="bg-blue-950/30 border border-blue-900/50 rounded-lg p-5 text-blue-100 flex items-start space-x-4">
												<Bot
													size={24}
													className="mt-1 flex-shrink-0 text-feature-blue"
												/>
												<div>
													<h4 className="font-semibold text-feature-blue mb-1">
														Agent Summary
													</h4>
													<p className="text-sm leading-relaxed opacity-90">
														I have analyzed the submitted code against the
														project requirements. The implementation correctly
														handles the new pricing logic for bulk items.
														However, I detected a potential SQL injection
														vulnerability in the input handling and a minor
														performance regression in the cart calculation loop.
														I recommend fixing the security issue before
														merging.
													</p>
												</div>
											</div>

											<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
												<div className="bg-surface p-5 rounded-lg border border-border flex flex-col items-center">
													<div className="text-muted-foreground text-xs uppercase font-semibold mb-2">
														Security Score
													</div>
													<div className="text-4xl font-bold text-green-400 mb-1">
														A+
													</div>
													<div className="text-green-500/60 text-xs">
														No vulnerabilities
													</div>
												</div>
												<div className="bg-surface p-5 rounded-lg border border-border flex flex-col items-center">
													<div className="text-muted-foreground text-xs uppercase font-semibold mb-2">
														Performance
													</div>
													<div className="text-4xl font-bold text-feature-blue mb-1">
														98
													</div>
													<div className="text-blue-500/60 text-xs">
														Optimized
													</div>
												</div>
												<div className="bg-surface p-5 rounded-lg border border-border flex flex-col items-center">
													<div className="text-muted-foreground text-xs uppercase font-semibold mb-2">
														Maintainability
													</div>
													<div className="text-4xl font-bold text-amber-400 mb-1">
														B
													</div>
													<div className="text-amber-500/60 text-xs">
														Refactor suggested
													</div>
												</div>
											</div>

											<div>
												<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
													Detected Issues
												</h3>
												<div className="space-y-3">
													{prIssues && prIssues.length > 0 ? (
														prIssues.filter(issue => !issue.resolved).map((issue) => (
															<div
																key={issue._id}
																className="bg-surface/50 border border-border rounded-lg p-4 flex items-start"
															>
																<div
																	className={`mt-0.5 mr-3 flex-shrink-0 ${
																		issue.severity === "error"
																			? "text-red-400"
																			: issue.severity === "warning"
																				? "text-amber-400"
																				: "text-blue-400"
																	}`}
																>
																	<AlertTriangle size={18} />
																</div>
																<div className="flex-1 min-w-0">
																	<h4 className="text-foreground font-medium text-sm">
																		{issue.title}
																	</h4>
																	<p className="text-muted-foreground text-sm mt-1">
																		{issue.description}
																	</p>
																	{issue.filePath && (
																		<p className="text-xs text-muted-foreground mt-1 font-mono">
																			{issue.filePath}{issue.lineNumber ? `:${issue.lineNumber}` : ""}
																		</p>
																	)}
																</div>
																<Button
																	variant="outline"
																	size="sm"
																	className="ml-3 shrink-0"
																>
																	Auto-fix
																</Button>
															</div>
														))
													) : (
														<div className="text-center py-8 text-muted-foreground">
															<CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
															<p className="text-sm">No issues detected</p>
														</div>
													)}
												</div>
											</div>
										</div>
									</TabsContent>

									<TabsContent value="remediation" className="!mt-0">
										<RemediationTab
											taskId={taskId}
											remediationPhase={getPhaseByName("remediation")}
											activeContainerId={task.activeContainerId}
										/>
									</TabsContent>

									<TabsContent value="human-review" className="!mt-0">
										<div className="space-y-6">
											<div className="bg-surface border border-border rounded-lg p-6">
												<div className="flex items-center justify-between mb-6">
													<h3 className="text-lg font-semibold text-foreground">
														Review Status
													</h3>
													<Badge variant="warning" className="uppercase">
														Pending Approval
													</Badge>
												</div>

												<div className="bg-background rounded-lg border border-border p-4 mb-6 flex items-center justify-between">
													<div className="flex items-center space-x-3">
														<Globe size={18} className="text-feature-blue" />
														<span className="text-muted-foreground text-sm">
															Deployment URL:
														</span>
														<a
															href="https://pr-4829.staging.app-planner.com"
															target="_blank"
															rel="noopener noreferrer"
															className="text-feature-blue text-sm hover:underline font-mono"
														>
															https://pr-4829.staging.app-planner.com
														</a>
													</div>
													<Button variant="outline" size="sm">
														Visit
													</Button>
												</div>

												<div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border mb-6">
													<div className="flex items-center">
														<div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-feature-purple font-bold mr-3">
															JD
														</div>
														<div>
															<div className="text-sm font-medium text-foreground">
																John Doe
															</div>
															<div className="text-xs text-muted-foreground">
																Lead Developer
															</div>
														</div>
													</div>
													<div className="flex space-x-3">
														<Button variant="outline">
															<MessageSquare size={16} className="mr-2" />
															Request Changes
														</Button>
														<Button className="bg-green-600 hover:bg-green-500">
															<ThumbsUp size={16} className="mr-2" />
															Approve
														</Button>
													</div>
												</div>

												<div className="space-y-4">
													<h4 className="text-sm font-medium text-muted-foreground">
														Comments
													</h4>
													<div className="flex space-x-3">
														<div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-feature-blue text-xs font-bold shrink-0">
															ME
														</div>
														<div className="flex-1">
															<Textarea
																className="h-24 resize-none"
																placeholder="Leave a comment..."
															/>
															<div className="flex justify-end mt-2">
																<Button variant="outline" size="sm">
																	Post Comment
																</Button>
															</div>
														</div>
													</div>
												</div>
											</div>
										</div>
									</TabsContent>

									<TabsContent value="merge" className="!mt-0">
										<div className="space-y-6">
											<div className="bg-surface border border-border rounded-lg p-6">
												<div className="flex items-center justify-between mb-6">
													<h3 className="text-lg font-semibold text-foreground">
														Merge Status
													</h3>
													<Badge variant="destructive" className="uppercase">
														Conflicts Detected
													</Badge>
												</div>

												<div className="bg-background rounded-lg border border-border p-4 mb-6">
													<div className="flex items-center justify-between">
														<div className="flex items-center space-x-3">
															<GitMerge size={18} className="text-red-400" />
															<div className="text-sm">
																<span className="font-mono bg-surface border border-border px-2 py-0.5 rounded text-foreground text-xs">
																	feature/task-{String(task.id).slice(-4)}
																</span>
																<ArrowRight
																	size={14}
																	className="inline mx-2 text-muted-foreground"
																/>
																<span className="font-mono bg-surface border border-border px-2 py-0.5 rounded text-foreground text-xs">
																	main
																</span>
															</div>
														</div>
														<span className="text-xs text-red-400">
															2 conflicting files
														</span>
													</div>
												</div>

												<div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4 mb-6">
													<div className="flex items-start space-x-3">
														<XCircle
															size={18}
															className="text-red-400 mt-0.5 flex-shrink-0"
														/>
														<div>
															<h4 className="text-sm font-medium text-red-200">
																Merge Conflicts Require Resolution
															</h4>
															<p className="text-xs text-red-300/70 mt-1">
																The automatic merge failed due to conflicts
																between the feature branch and recent changes in
																main. Review the conflicts below and choose a
																resolution method.
															</p>
														</div>
													</div>
												</div>

												<div className="space-y-4">
													<h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
														Conflicting Files
													</h4>
													<div className="space-y-3">
														<div className="bg-background rounded-lg border border-red-900/50 overflow-hidden">
															<button
																type="button"
																className="w-full flex items-center justify-between p-3 bg-red-950/20 hover:bg-red-950/30 transition-colors border-b border-red-900/30"
															>
																<div className="flex items-center space-x-2 text-sm font-mono text-foreground">
																	<ChevronDown size={16} />
																	<span>src/utils/cart.js</span>
																</div>
																<Badge
																	variant="destructive"
																	className="text-xs"
																>
																	3 conflicts
																</Badge>
															</button>
															<div className="font-mono text-sm leading-6">
																<div className="bg-surface/30 p-2 text-xs text-muted-foreground border-b border-border">
																	Lines 24-32
																</div>
																<div className="bg-red-500/5 border-l-2 border-red-500">
																	<div className="px-3 py-1 text-xs text-red-400 bg-red-950/30">
																		{"<<<<<<< HEAD (main)"}
																	</div>
																	<div className="flex">
																		<div className="w-10 text-muted-foreground text-right pr-3 select-none border-r border-border/50 bg-surface/30">
																			25
																		</div>
																		<div className="flex-1 px-3 text-red-300 whitespace-pre">
																			{
																				"  return items.reduce((acc, item) => acc + item.price, 0);"
																			}
																		</div>
																	</div>
																</div>
																<div className="px-3 py-1 text-xs text-muted-foreground bg-surface/50">
																	{"======="}
																</div>
																<div className="bg-green-500/5 border-l-2 border-green-500">
																	<div className="flex">
																		<div className="w-10 text-muted-foreground text-right pr-3 select-none border-r border-border/50 bg-surface/30">
																			25
																		</div>
																		<div className="flex-1 px-3 text-green-300 whitespace-pre">
																			{
																				"  return items.reduce((acc, item) => acc + (item.price * item.qty), 0);"
																			}
																		</div>
																	</div>
																	<div className="px-3 py-1 text-xs text-green-400 bg-green-950/30">
																		{">>>>>>> feature/task-" +
																			String(task.id).slice(-4)}
																	</div>
																</div>
																<div className="p-3 bg-surface/30 border-t border-border flex items-center justify-between">
																	<span className="text-xs text-muted-foreground">
																		Choose resolution:
																	</span>
																	<div className="flex space-x-2">
																		<Button
																			variant="outline"
																			size="sm"
																			className="text-xs h-7"
																		>
																			Keep Main
																		</Button>
																		<Button
																			variant="outline"
																			size="sm"
																			className="text-xs h-7"
																		>
																			Keep Ours
																		</Button>
																		<Button
																			variant="outline"
																			size="sm"
																			className="text-xs h-7 text-feature-blue border-feature-blue/50"
																		>
																			<Bot size={12} className="mr-1" />
																			AI Merge
																		</Button>
																	</div>
																</div>
															</div>
														</div>

														<div className="bg-background rounded-lg border border-red-900/50 overflow-hidden">
															<button
																type="button"
																className="w-full flex items-center justify-between p-3 bg-red-950/20 hover:bg-red-950/30 transition-colors"
															>
																<div className="flex items-center space-x-2 text-sm font-mono text-foreground">
																	<ChevronRight size={16} />
																	<span>src/components/Checkout.jsx</span>
																</div>
																<Badge
																	variant="destructive"
																	className="text-xs"
																>
																	1 conflict
																</Badge>
															</button>
														</div>
													</div>
												</div>

												<div className="mt-6 pt-6 border-t border-border">
													<h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
														Resolution Options
													</h4>
													<div className="flex space-x-3">
														<Button className="bg-feature-blue hover:bg-feature-blue/80">
															<Bot size={16} className="mr-2" />
															Auto-Resolve All Conflicts
														</Button>
														<Button variant="outline">
															<GitMerge size={16} className="mr-2" />
															Manual Resolution
														</Button>
														<Button
															variant="outline"
															className="text-red-400 border-red-900/50 hover:bg-red-950/30"
														>
															<XCircle size={16} className="mr-2" />
															Abort Merge
														</Button>
													</div>
													<p className="text-xs text-muted-foreground mt-3">
														AI will analyze both versions and create an
														intelligent merge that preserves the intent of both
														changes.
													</p>
												</div>
											</div>

											<div className="bg-surface border border-border rounded-lg p-6">
												<h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
													Merge History
												</h4>
												<div className="relative border-l border-border ml-3 space-y-4">
													<div className="relative pl-6">
														<div className="absolute -left-1.5 top-1.5 w-3 h-3 bg-red-500 border border-red-400 rounded-full"></div>
														<div className="text-sm text-foreground font-medium">
															Merge attempt failed - conflicts detected
														</div>
														<div className="text-xs text-muted-foreground mt-1 flex items-center space-x-2">
															<Bot size={12} />
															<span>Agent</span>
															<span className="w-1 h-1 bg-muted rounded-full"></span>
															<span>2 minutes ago</span>
														</div>
													</div>
													<div className="relative pl-6">
														<div className="absolute -left-1.5 top-1.5 w-3 h-3 bg-green-500 border border-green-400 rounded-full"></div>
														<div className="text-sm text-foreground font-medium">
															Human review approved
														</div>
														<div className="text-xs text-muted-foreground mt-1 flex items-center space-x-2">
															<User size={12} />
															<span>John Doe</span>
															<span className="w-1 h-1 bg-muted rounded-full"></span>
															<span>5 minutes ago</span>
														</div>
													</div>
												</div>
											</div>
										</div>
									</TabsContent>

									<TabsContent value="diff" className="!mt-0">
										<div className="space-y-4">
											{pullRequest ? (
												<>
													<div className="bg-surface border border-border rounded-lg p-6 text-center">
														<GitPullRequest size={32} className="mx-auto mb-3 text-muted-foreground" />
														<h3 className="text-lg font-medium text-foreground mb-2">
															View Diff on GitHub
														</h3>
														<p className="text-sm text-muted-foreground mb-4">
															PR #{pullRequest.prNumber} - {pullRequest.title}
														</p>
														{pullRequest.url && (
															<Button
																variant="outline"
																onClick={() => window.open(pullRequest.url, "_blank")}
															>
																<Globe size={16} className="mr-2" />
																Open on GitHub
															</Button>
														)}
													</div>
													<div className="text-xs text-muted-foreground text-center">
														Branch: <code className="bg-surface px-1.5 py-0.5 rounded">{pullRequest.branch}</code>
														{" → "}
														<code className="bg-surface px-1.5 py-0.5 rounded">{pullRequest.baseBranch}</code>
													</div>
												</>
											) : (
												<div className="bg-surface border border-border rounded-lg p-8 text-center">
													<FileText size={32} className="mx-auto mb-3 text-muted-foreground" />
													<h3 className="text-lg font-medium text-foreground mb-2">
														No Changes Yet
													</h3>
													<p className="text-sm text-muted-foreground mb-4">
														Code changes will appear here once the implementation phase begins.
													</p>
													<Button onClick={handleCreatePR}>
														<GitPullRequest size={16} className="mr-2" /> Create PR
													</Button>
												</div>
											)}
										</div>
									</TabsContent>
								</div>
							</div>
						</Tabs>
					</div>
				</div>
			</div>

			<DependencyPickerModal
				open={showDependencyPicker}
				onOpenChange={setShowDependencyPicker}
				tasks={project?.tasks || []}
				currentTaskId={task.id}
				existingDependencies={task.dependencies || []}
				onSelect={handleAddDependency}
			/>
		</div>
	)
}
