import { MessageSquare, Send } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { ChatMessage, ChatMessagePart } from "@/types"
import { ToolCallCard } from "./ToolCallCard"

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

// Render message content with structured parts
function renderMessageContent(msg: ChatMessage) {
	// User messages or messages without parts: plain text
	if (msg.sender === "user" || !msg.parts || msg.parts.length === 0) {
		return <span className="whitespace-pre-wrap">{msg.text}</span>
	}

	// AI messages with structured parts
	const groupedParts = groupMessageParts(msg.parts)

	return (
		<div className="space-y-2">
			{groupedParts.map((group, idx) => {
				if (group.type === "text") {
					return (
						<span key={idx} className="whitespace-pre-wrap block">
							{group.content}
						</span>
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
	selectedProvider?: Provider
	selectedModel?: Model
	onProviderChange?: (provider: Provider) => void
	onModelChange?: (model: Model) => void
}

export function AgentChatPanel({
	chatHistory,
	onSendMessage,
	isLoading = false,
	selectedProvider: externalProvider,
	selectedModel: externalModel,
	onProviderChange,
	onModelChange,
}: AgentChatPanelProps) {
	const [chatInput, setChatInput] = useState("")
	// Use external state if provided, otherwise local state
	const [internalProvider, setInternalProvider] = useState<Provider>("anthropic")
	const [internalModel, setInternalModel] = useState<Model>("sonnet")

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
	const scrollAreaRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const textarea = textareaRef.current
		if (textarea) {
			textarea.style.height = "auto"
			textarea.style.height = `${textarea.scrollHeight}px`
		}
	}, [chatInput])

	// Auto-scroll to bottom when new messages arrive or loading state changes
	useEffect(() => {
		if (scrollAreaRef.current) {
			const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
			if (scrollContainer) {
				scrollContainer.scrollTop = scrollContainer.scrollHeight
			}
		}
	}, [chatHistory?.length, isLoading])

	const handleSend = (e: React.FormEvent) => {
		e.preventDefault()
		if (!chatInput.trim()) return
		onSendMessage(chatInput, selectedProvider, selectedModel)
		setChatInput("")
	}

	return (
		<div className="flex flex-col h-full">
			<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
				<MessageSquare size={16} className="mr-2" />
				Agent Chat
			</h3>
			<div className="bg-surface border border-border rounded-lg flex flex-col flex-1 overflow-hidden">
				<ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
					<div className="space-y-4">
						{chatHistory?.map((msg) => (
							<div
								key={msg.id}
								className={cn(
									"flex flex-col",
									msg.sender === "user" ? "items-end" : "items-start",
								)}
							>
								<div
									className={cn(
										"max-w-[85%] rounded-lg p-component text-sm shadow-sm",
										msg.sender === "user"
											? "bg-primary text-primary-foreground rounded-br-sm"
											: "bg-surface-elevated text-foreground rounded-bl-sm border border-border",
									)}
								>
									{renderMessageContent(msg)}
								</div>
								<span className="text-[10px] text-muted-foreground mt-1 px-compact">
									{msg.time}
								</span>
							</div>
						))}
						{isLoading && (
							<div className="flex flex-col items-start">
								<div className="bg-surface-elevated text-foreground rounded-lg rounded-bl-sm border border-border p-component text-sm shadow-sm">
									<div className="flex items-center space-x-1">
										<div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
										<div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
										<div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
									</div>
								</div>
								<span className="text-[10px] text-muted-foreground mt-1 px-compact">
									Agent thinking...
								</span>
							</div>
						)}
					</div>
				</ScrollArea>

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
