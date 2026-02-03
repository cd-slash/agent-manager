import { AlertCircle, RefreshCw, Send } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type {
	ChatMessage,
	ChatMessagePart,
	EnabledModelsGrouped,
} from "@/types"
import { ToolCallGroup } from "./ToolCallGroup"

// Agent status during message processing
export type AgentStatus =
	| "idle"
	| "waiting_for_container"
	| "starting_container"
	| "container_ready"
	| "thinking"

// Status message labels
const statusLabels: Record<AgentStatus, string> = {
	idle: "",
	waiting_for_container: "Waiting for container...",
	starting_container: "Starting container...",
	container_ready: "Container ready",
	thinking: "Agent thinking...",
}

// Group message parts: consecutive text parts merged, tool_use and thinking grouped together
type GroupedPart =
	| { type: "text"; content: string }
	| { type: "tool_group"; parts: ChatMessagePart[] }

function groupMessageParts(parts: ChatMessagePart[]): GroupedPart[] {
	const grouped: GroupedPart[] = []
	let currentText = ""
	let currentToolGroup: ChatMessagePart[] = []

	const flushText = () => {
		if (currentText) {
			grouped.push({ type: "text", content: currentText })
			currentText = ""
		}
	}

	const flushToolGroup = () => {
		if (currentToolGroup.length > 0) {
			grouped.push({ type: "tool_group", parts: [...currentToolGroup] })
			currentToolGroup = []
		}
	}

	for (const part of parts) {
		if (part.type === "text") {
			flushToolGroup()
			currentText += (currentText ? " " : "") + part.content
		} else if (part.type === "tool_use" || part.type === "thinking") {
			flushText()
			currentToolGroup.push(part)
		}
	}

	flushText()
	flushToolGroup()

	return grouped
}

// Markdown component styling
function MarkdownContent({ content }: { content: string }) {
	return (
		<ReactMarkdown
			components={{
				p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
				h1: ({ children }) => (
					<h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>
				),
				h2: ({ children }) => (
					<h2 className="text-base font-bold mb-2 mt-3 first:mt-0">
						{children}
					</h2>
				),
				h3: ({ children }) => (
					<h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>
				),
				ul: ({ children }) => (
					<ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
				),
				ol: ({ children }) => (
					<ol className="list-decimal list-inside mb-2 space-y-1">
						{children}
					</ol>
				),
				li: ({ children }) => <li className="text-sm">{children}</li>,
				code: ({ className, children }) => {
					const isInline = !className
					if (isInline) {
						return (
							<code className="bg-background px-1 py-0.5 rounded text-xs font-mono">
								{children}
							</code>
						)
					}
					return (
						<code className="block bg-background p-2 rounded text-xs font-mono overflow-x-auto my-2">
							{children}
						</code>
					)
				},
				pre: ({ children }) => (
					<pre className="bg-background p-2 rounded overflow-x-auto my-2">
						{children}
					</pre>
				),
				strong: ({ children }) => (
					<strong className="font-semibold">{children}</strong>
				),
				em: ({ children }) => <em className="italic">{children}</em>,
				a: ({ href, children }) => (
					<a
						href={href}
						className="text-feature-blue hover:underline"
						target="_blank"
						rel="noopener noreferrer"
					>
						{children}
					</a>
				),
				blockquote: ({ children }) => (
					<blockquote className="border-l-2 border-muted pl-3 my-2 text-muted-foreground italic">
						{children}
					</blockquote>
				),
			}}
		>
			{content}
		</ReactMarkdown>
	)
}

// Render message content with structured parts
function renderMessageContent(msg: ChatMessage) {
	// User messages: plain text (no markdown parsing needed)
	if (msg.sender === "user") {
		return <span className="whitespace-pre-wrap">{msg.text}</span>
	}

	// AI messages without parts: render as markdown
	if (!msg.parts || msg.parts.length === 0) {
		return <MarkdownContent content={msg.text} />
	}

	// AI messages with structured parts
	const groupedParts = groupMessageParts(msg.parts)

	// Debug: log parts info
	console.log(
		"[AgentChatPanel] Message parts:",
		msg.parts.length,
		"Grouped:",
		groupedParts.length,
		groupedParts.map((g) => g.type),
	)

	return (
		<div className="space-y-2">
			{groupedParts.map((group, idx) => {
				if (group.type === "text") {
					return (
						<div
							key={`text-${idx}-${group.content.slice(0, 20)}`}
							className="block"
						>
							<MarkdownContent content={group.content} />
						</div>
					)
				}

				if (group.type === "tool_group") {
					// Generate a stable key from the first tool's ID or name
					const firstTool = group.parts.find((p) => p.type === "tool_use")
					const toolKey =
						firstTool?.type === "tool_use"
							? firstTool.toolId || firstTool.toolName
							: `group-${idx}`
					return (
						<ToolCallGroup
							key={`tools-${toolKey}`}
							parts={group.parts}
							isStreaming={msg.isStreaming}
						/>
					)
				}

				return null
			})}
		</div>
	)
}

export type Provider = string
export type Model = string

interface AgentChatPanelProps {
	chatHistory?: ChatMessage[]
	onSendMessage: (text: string, provider: Provider, model: Model) => void
	isLoading?: boolean
	agentStatus?: AgentStatus
	selectedProvider?: Provider
	selectedModel?: Model
	onProviderChange?: (provider: Provider) => void
	onModelChange?: (model: Model) => void
	modelGroups?: EnabledModelsGrouped[] | null
	sessionId?: string | null
	onNewSession?: () => void
}

export function AgentChatPanel({
	chatHistory,
	onSendMessage,
	isLoading = false,
	agentStatus = "idle",
	selectedProvider: externalProvider,
	selectedModel: externalModel,
	onProviderChange,
	onModelChange,
	modelGroups,
	sessionId,
	onNewSession,
}: AgentChatPanelProps) {
	const [chatInput, setChatInput] = useState("")
	// Use external state if provided, otherwise local state
	const [internalProvider, setInternalProvider] = useState<Provider>("")
	const [internalModel, setInternalModel] = useState<Model>("")

	const selectedProvider = externalProvider ?? internalProvider
	const selectedModel = externalModel ?? internalModel

	const handleProviderChange = useCallback(
		(provider: Provider) => {
			if (onProviderChange) {
				onProviderChange(provider)
			} else {
				setInternalProvider(provider)
			}
		},
		[onProviderChange],
	)

	const handleModelChange = useCallback(
		(model: Model) => {
			if (onModelChange) {
				onModelChange(model)
			} else {
				setInternalModel(model)
			}
		},
		[onModelChange],
	)

	const providerOptions = modelGroups ?? []
	const selectedProviderGroup = providerOptions.find(
		(group) => group.providerId === selectedProvider,
	)
	const modelOptions = selectedProviderGroup?.models ?? []

	useEffect(() => {
		if (!selectedProvider && providerOptions.length > 0) {
			const firstProvider = providerOptions[0]
			if (firstProvider) {
				handleProviderChange(firstProvider.providerId)
				if (firstProvider.models.length > 0) {
					handleModelChange(firstProvider.models[0].id)
				}
			}
		}
	}, [
		handleProviderChange,
		handleModelChange,
		providerOptions,
		selectedProvider,
	])

	useEffect(() => {
		if (!selectedProviderGroup) return
		if (modelOptions.length === 0) return
		const hasSelectedModel = modelOptions.some(
			(model) => model.id === selectedModel,
		)
		if (!hasSelectedModel) {
			handleModelChange(modelOptions[0].id)
		}
	}, [handleModelChange, modelOptions, selectedModel, selectedProviderGroup])
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	// Track whether user has scrolled away from bottom (disables auto-scroll)
	const [userHasScrolled, setUserHasScrolled] = useState(false)
	// Track if we're programmatically scrolling
	const isProgrammaticScroll = useRef(false)

	useEffect(() => {
		const textarea = textareaRef.current
		if (textarea) {
			textarea.style.height = "auto"
			textarea.style.height = `${textarea.scrollHeight}px`
		}
	}, [])

	// Check if user is at the bottom of the scroll container
	const isAtBottom = useCallback(() => {
		const container = scrollContainerRef.current
		if (!container) return true
		const threshold = 50 // pixels from bottom to consider "at bottom"
		return (
			container.scrollHeight - container.scrollTop - container.clientHeight <
			threshold
		)
	}, [])

	// Scroll to bottom programmatically
	const scrollToBottom = useCallback(() => {
		const container = scrollContainerRef.current
		if (!container) return
		isProgrammaticScroll.current = true
		container.scrollTop = container.scrollHeight
		// Reset programmatic flag after scroll settles
		requestAnimationFrame(() => {
			isProgrammaticScroll.current = false
		})
	}, [])

	// Handle scroll events to detect user scroll
	const handleScroll = useCallback(() => {
		// Ignore programmatic scrolls
		if (isProgrammaticScroll.current) return

		if (isAtBottom()) {
			// User scrolled back to bottom, re-enable auto-scroll
			setUserHasScrolled(false)
		} else {
			// User scrolled away from bottom, disable auto-scroll
			setUserHasScrolled(true)
		}
	}, [isAtBottom])

	// Auto-scroll to bottom when new messages arrive or loading state changes
	// Only if user hasn't manually scrolled away
	useEffect(() => {
		if (!userHasScrolled) {
			scrollToBottom()
		}
	}, [userHasScrolled, scrollToBottom])

	const handleSend = (e: React.FormEvent) => {
		e.preventDefault()
		if (!chatInput.trim()) return
		onSendMessage(chatInput, selectedProvider, selectedModel)
		setChatInput("")
	}

	return (
		<div className="flex flex-col h-full">
			<div className="bg-surface border border-border rounded-lg flex flex-col flex-1 overflow-hidden">
				<div
					ref={scrollContainerRef}
					onScroll={handleScroll}
					className="flex-1 p-4 scrollbar-styled scrollbar-no-margin overflow-x-hidden overflow-y-auto"
				>
					<div className="space-y-4">
						{chatHistory?.map((msg) => (
							<div
								key={msg.id}
								className={cn(
									"flex flex-col min-w-0",
									msg.sender === "user" ? "items-end" : "items-start",
								)}
							>
								{msg.sender === "user" ? (
									<div className="max-w-[85%] rounded-lg rounded-br-sm p-component text-sm shadow-sm bg-primary text-primary-foreground">
										{renderMessageContent(msg)}
									</div>
								) : msg.isError ? (
									<div className="w-full text-sm min-w-0 overflow-hidden">
										<div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
											<AlertCircle
												size={16}
												className="text-destructive shrink-0 mt-0.5"
											/>
											<div className="text-destructive min-w-0 overflow-hidden">
												<div className="font-medium mb-1">Error</div>
												<div className="font-mono text-xs whitespace-pre-wrap break-words">
													{msg.text}
												</div>
											</div>
										</div>
									</div>
								) : (
									<div className="w-full text-sm text-foreground min-w-0 overflow-hidden">
										{renderMessageContent(msg)}
									</div>
								)}
								<div className="flex items-center gap-1.5 mt-1.5">
									<Badge
										variant="outline"
										className="text-[10px] font-normal py-0 px-1.5"
									>
										{msg.time}
									</Badge>
									{msg.sender === "ai" && msg.isError && (
										<Badge
											variant="destructive"
											className="text-[10px] font-normal py-0 px-1.5"
										>
											Error
										</Badge>
									)}
									{msg.sender === "ai" && msg.model && !msg.isError && (
										<Badge
											variant="outline"
											className="text-[10px] font-normal py-0 px-1.5"
										>
											{msg.model}
										</Badge>
									)}
								</div>
							</div>
						))}
						{isLoading && (
							<div className="flex flex-col items-start">
								<div className="flex items-center space-x-1 py-1">
									<div
										className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
										style={{ animationDelay: "0ms" }}
									/>
									<div
										className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
										style={{ animationDelay: "150ms" }}
									/>
									<div
										className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
										style={{ animationDelay: "300ms" }}
									/>
								</div>
								<span className="text-[10px] text-muted-foreground mt-1 px-compact">
									{statusLabels[agentStatus] || statusLabels.thinking}
								</span>
							</div>
						)}
					</div>
				</div>

				<div className="p-4 border-t border-border space-y-3">
					<form onSubmit={handleSend} className="relative">
						<textarea
							ref={textareaRef}
							value={chatInput}
							onChange={(e) => setChatInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault()
									handleSend(e)
								}
							}}
							placeholder="Ask agent..."
							rows={1}
							className="w-full rounded-md border border-input bg-transparent px-3 py-2 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden"
						/>
						<Button
							type="submit"
							variant="ghost"
							size="icon-sm"
							className="absolute right-1 bottom-2 text-muted-foreground hover:text-foreground"
						>
							<Send size={16} />
						</Button>
					</form>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="flex items-center gap-2">
								<Select
									value={selectedProvider}
									onValueChange={(value) => handleProviderChange(value)}
									disabled={providerOptions.length === 0}
								>
									<SelectTrigger className="h-7 text-xs">
										<SelectValue placeholder="Provider" />
									</SelectTrigger>
									<SelectContent>
										{providerOptions.map((group) => (
											<SelectItem
												key={group.providerId}
												value={group.providerId}
											>
												{group.providerName}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							{sessionId && (
								<div className="flex items-center gap-1.5">
									<span className="text-[10px] text-muted-foreground font-mono">
										{sessionId.slice(0, 8)}
									</span>
									{onNewSession && (
										<Button
											variant="ghost"
											size="icon-sm"
											className="h-5 w-5"
											onClick={onNewSession}
											title="Start new session"
										>
											<RefreshCw size={12} />
										</Button>
									)}
								</div>
							)}
						</div>
						<Select
							value={selectedModel}
							onValueChange={(value) => handleModelChange(value)}
							disabled={modelOptions.length === 0}
						>
							<SelectTrigger className="h-7 text-xs">
								<SelectValue placeholder="Model" />
							</SelectTrigger>
							<SelectContent>
								{modelOptions.map((model) => (
									<SelectItem key={model.id} value={model.id}>
										{model.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</div>
		</div>
	)
}
