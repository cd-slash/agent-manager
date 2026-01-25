import { MessageSquare, RefreshCw, Send } from "lucide-react"
import { useEffect, useRef, useState, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ChatMessage, ChatMessagePart } from "@/types"
import { ToolCallCard } from "./ToolCallCard"

// Agent status during message processing
export type AgentStatus = "idle" | "waiting_for_container" | "starting_container" | "container_ready" | "thinking"

// Status message labels
const statusLabels: Record<AgentStatus, string> = {
	idle: "",
	waiting_for_container: "Waiting for container...",
	starting_container: "Starting container...",
	container_ready: "Container ready",
	thinking: "Agent thinking...",
}

// Helper to group consecutive text parts together
function groupMessageParts(parts: ChatMessagePart[]): ChatMessagePart[] {
	const grouped: ChatMessagePart[] = []
	let currentText = ""

	for (const part of parts) {
		if (part.type === "text") {
			currentText += (currentText ? " " : "") + part.content
		} else {
			if (currentText) {
				grouped.push({ type: "text", content: currentText })
				currentText = ""
			}
			grouped.push(part)
		}
	}

	if (currentText) {
		grouped.push({ type: "text", content: currentText })
	}

	return grouped
}

// Markdown component styling
function MarkdownContent({ content }: { content: string }) {
	return (
		<ReactMarkdown
			components={{
				p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
				h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
				h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
				h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>,
				ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
				ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
				li: ({ children }) => <li className="text-sm">{children}</li>,
				code: ({ className, children }) => {
					const isInline = !className
					if (isInline) {
						return <code className="bg-background px-1 py-0.5 rounded text-xs font-mono">{children}</code>
					}
					return (
						<code className="block bg-background p-2 rounded text-xs font-mono overflow-x-auto my-2">
							{children}
						</code>
					)
				},
				pre: ({ children }) => <pre className="bg-background p-2 rounded overflow-x-auto my-2">{children}</pre>,
				strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
				em: ({ children }) => <em className="italic">{children}</em>,
				a: ({ href, children }) => (
					<a href={href} className="text-feature-blue hover:underline" target="_blank" rel="noopener noreferrer">
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

	return (
		<div className="space-y-2">
			{groupedParts.map((group, idx) => {
				if (group.type === "text") {
					return (
						<div key={idx} className="block">
							<MarkdownContent content={group.content} />
						</div>
					)
				}

				if (group.type === "tool_use") {
					return (
						<ToolCallCard
							key={idx}
							toolName={group.toolName!}
							toolInput={group.toolInput}
							result={group.result}
							isStreaming={msg.isStreaming && !group.result}
						/>
					)
				}

				return null
			})}
		</div>
	)
}

export type Provider = "anthropic" | "zai"
export type Model = "haiku" | "sonnet" | "opus"

interface AgentChatPanelProps {
	chatHistory?: ChatMessage[]
	onSendMessage: (text: string, provider: Provider, model: Model) => void
	isLoading?: boolean
	agentStatus?: AgentStatus
	selectedProvider?: Provider
	selectedModel?: Model
	onProviderChange?: (provider: Provider) => void
	onModelChange?: (model: Model) => void
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
	sessionId,
	onNewSession,
}: AgentChatPanelProps) {
	const [chatInput, setChatInput] = useState("")
	// Use external state if provided, otherwise local state
	const [internalProvider, setInternalProvider] = useState<Provider>("anthropic")
	const [internalModel, setInternalModel] = useState<Model>("opus")

	const selectedProvider = externalProvider ?? internalProvider
	const selectedModel = externalModel ?? internalModel

	const handleProviderChange = (provider: Provider) => {
		if (onProviderChange) {
			onProviderChange(provider)
		} else {
			setInternalProvider(provider)
		}
	}

	const handleModelChange = (model: Model) => {
		if (onModelChange) {
			onModelChange(model)
		} else {
			setInternalModel(model)
		}
	}
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
	}, [chatInput])

	// Check if user is at the bottom of the scroll container
	const isAtBottom = useCallback(() => {
		const container = scrollContainerRef.current
		if (!container) return true
		const threshold = 50 // pixels from bottom to consider "at bottom"
		return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
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
	}, [chatHistory?.length, isLoading, userHasScrolled, scrollToBottom])

	const handleSend = (e: React.FormEvent) => {
		e.preventDefault()
		if (!chatInput.trim()) return
		onSendMessage(chatInput, selectedProvider, selectedModel)
		setChatInput("")
	}

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center">
					<MessageSquare size={16} className="mr-2" />
					Agent Chat
				</h3>
				{sessionId && (
					<div className="flex items-center gap-2">
						<span className="text-[10px] text-muted-foreground font-mono">
							Session: {sessionId.slice(0, 8)}...
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
			<div className="bg-surface border border-border rounded-lg flex flex-col flex-1 overflow-hidden">
				<div
					ref={scrollContainerRef}
					onScroll={handleScroll}
					className="flex-1 p-4 scrollbar-styled scrollbar-no-margin"
				>
					<div className="space-y-4">
						{chatHistory?.map((msg) => (
							<div
								key={msg.id}
								className={cn(
									"flex flex-col",
									msg.sender === "user" ? "items-end" : "items-start",
								)}
							>
								{msg.sender === "user" ? (
									<div className="max-w-[85%] rounded-lg rounded-br-sm p-component text-sm shadow-sm bg-primary text-primary-foreground">
										{renderMessageContent(msg)}
									</div>
								) : (
									<div className="w-full text-sm text-foreground">
										{renderMessageContent(msg)}
									</div>
								)}
								<span className="text-[10px] text-muted-foreground mt-1 px-compact">
									{msg.time}{msg.sender === "ai" && msg.model && ` · ${msg.model}`}
								</span>
							</div>
						))}
						{isLoading && (
							<div className="flex flex-col items-start">
								<div className="flex items-center space-x-1 py-1">
									<div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
									<div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
									<div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
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
						<div className="flex items-center bg-background rounded-md border border-border p-[3px] h-7">
							<button
								type="button"
								onClick={() => handleProviderChange("anthropic")}
								className={cn(
									"px-2.5 h-5 text-xs font-medium rounded transition-colors flex items-center",
									selectedProvider === "anthropic"
										? "bg-surface-elevated text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								Anthropic
							</button>
							<button
								type="button"
								onClick={() => handleProviderChange("zai")}
								className={cn(
									"px-2.5 h-5 text-xs font-medium rounded transition-colors flex items-center",
									selectedProvider === "zai"
										? "bg-surface-elevated text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								ZAI
							</button>
						</div>
						<div className="flex items-center bg-background rounded-md border border-border p-[3px] h-7">
							<button
								type="button"
								onClick={() => handleModelChange("haiku")}
								className={cn(
									"px-2.5 h-5 text-xs font-medium rounded transition-colors flex items-center",
									selectedModel === "haiku"
										? "bg-surface-elevated text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								Haiku
							</button>
							<button
								type="button"
								onClick={() => handleModelChange("sonnet")}
								className={cn(
									"px-2.5 h-5 text-xs font-medium rounded transition-colors flex items-center",
									selectedModel === "sonnet"
										? "bg-surface-elevated text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								Sonnet
							</button>
							<button
								type="button"
								onClick={() => handleModelChange("opus")}
								className={cn(
									"px-2.5 h-5 text-xs font-medium rounded transition-colors flex items-center",
									selectedModel === "opus"
										? "bg-surface-elevated text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								Opus
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
