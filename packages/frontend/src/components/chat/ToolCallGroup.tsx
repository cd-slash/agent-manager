import { Brain, ChevronDown, ChevronRight, Terminal } from "lucide-react"
import { useState } from "react"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { ChatMessagePart } from "@/types"
import { ThinkingBlock } from "./ThinkingBlock"
import { ToolCallCard } from "./ToolCallCard"

interface ToolCallGroupProps {
	parts: ChatMessagePart[]
	isStreaming?: boolean
}

export function ToolCallGroup({ parts, isStreaming }: ToolCallGroupProps) {
	const [isOpen, setIsOpen] = useState(false)

	// Separate tool uses and thinking blocks
	const toolUses = parts.filter((p) => p.type === "tool_use")
	const thinkingBlocks = parts.filter((p) => p.type === "thinking")

	// Count running tools (tools without results that are still streaming)
	const runningToolsCount = isStreaming
		? toolUses.filter((tool) => !tool.result).length
		: 0

	// Determine if the last tool without a result should show "running"
	const lastToolWithoutResultIndex = toolUses.reduceRight(
		(acc, tool, idx) => (acc === -1 && !tool.result ? idx : acc),
		-1,
	)

	const totalItems = toolUses.length + thinkingBlocks.length

	if (totalItems === 0) return null

	// Build the summary text
	const summaryParts: string[] = []
	if (toolUses.length > 0) {
		summaryParts.push(
			`${toolUses.length} tool${toolUses.length !== 1 ? "s" : ""}`,
		)
	}
	if (thinkingBlocks.length > 0) {
		summaryParts.push(
			`${thinkingBlocks.length} thinking block${thinkingBlocks.length !== 1 ? "s" : ""}`,
		)
	}
	const summary = summaryParts.join(", ")

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className={cn(
						"w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded",
						"bg-muted/30 hover:bg-muted/50 border border-border/50 transition-colors",
						isStreaming && runningToolsCount > 0 && "animate-pulse",
					)}
				>
					{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
					{toolUses.length > 0 && (
						<Terminal size={12} className="text-muted-foreground" />
					)}
					{thinkingBlocks.length > 0 && toolUses.length === 0 && (
						<Brain size={12} className="text-muted-foreground" />
					)}
					<span className="font-medium">{summary}</span>
					<span className="flex-1" />
					{isStreaming && runningToolsCount > 0 && (
						<span className="text-muted-foreground">
							{runningToolsCount} running...
						</span>
					)}
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mt-1 space-y-1 pl-2">
					{/* Render thinking blocks first */}
					{thinkingBlocks.map((block, idx) => (
						<ThinkingBlock
							key={`thinking-${block.content.slice(0, 20)}-${idx}`}
							content={block.content}
							isStreaming={isStreaming && idx === thinkingBlocks.length - 1}
						/>
					))}
					{/* Render tool calls */}
					{toolUses.map((tool, idx) => (
						<ToolCallCard
							key={`tool-${tool.toolId || `unnamed-${idx}`}`}
							toolName={tool.toolName ?? "Unknown Tool"}
							toolInput={tool.toolInput}
							result={tool.result}
							isStreaming={
								isStreaming &&
								!tool.result &&
								idx === lastToolWithoutResultIndex
							}
						/>
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}
