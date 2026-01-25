import { useState } from "react"
import { ChevronRight, ChevronDown, Brain } from "lucide-react"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

interface ThinkingBlockProps {
	content: string
	isStreaming?: boolean
}

export function ThinkingBlock({ content, isStreaming }: ThinkingBlockProps) {
	const [isOpen, setIsOpen] = useState(false)

	// Get a preview of the thinking content (first line or truncated)
	const firstLine = content.split("\n")[0] ?? ""
	const preview = firstLine.slice(0, 50) + (content.length > 50 ? "..." : "")

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className={cn(
						"w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded",
						"bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition-colors",
						isStreaming && "animate-pulse"
					)}
				>
					{isOpen ? (
						<ChevronDown size={12} />
					) : (
						<ChevronRight size={12} />
					)}
					<Brain size={12} className="text-purple-400" />
					<span className="font-medium text-purple-300">Thinking</span>
					{!isOpen && (
						<span className="text-muted-foreground truncate flex-1 text-left ml-2">
							{preview}
						</span>
					)}
					<span className="flex-1" />
					{isStreaming && (
						<span className="text-purple-400">...</span>
					)}
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mt-1 px-2">
					<div className="bg-purple-500/5 border border-purple-500/20 rounded p-2 text-xs text-purple-200/80 max-h-48 whitespace-pre-wrap break-words scrollbar-styled scrollbar-no-margin overflow-x-hidden">
						{content}
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}
