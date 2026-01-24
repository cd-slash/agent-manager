import { useState } from "react"
import { ChevronRight, ChevronDown, Terminal, Check, X } from "lucide-react"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

interface ToolCallCardProps {
	toolName: string
	toolInput?: string
	result?: { content: string; isError: boolean }
	isStreaming?: boolean
}

export function ToolCallCard({
	toolName,
	toolInput,
	result,
	isStreaming,
}: ToolCallCardProps) {
	const [isOpen, setIsOpen] = useState(false)

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className={cn(
						"w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded",
						"bg-muted/30 hover:bg-muted/50 border border-border/50 transition-colors",
						isStreaming && "animate-pulse"
					)}
				>
					{isOpen ? (
						<ChevronDown size={12} />
					) : (
						<ChevronRight size={12} />
					)}
					<Terminal size={12} className="text-muted-foreground" />
					<span className="font-medium font-mono">{toolName}</span>
					<span className="flex-1" />
					{result &&
						(result.isError ? (
							<X size={12} className="text-destructive" />
						) : (
							<Check size={12} className="text-green-500" />
						))}
					{isStreaming && (
						<span className="text-muted-foreground">Running...</span>
					)}
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mt-1 ml-4 text-xs space-y-1">
					{toolInput && (
						<pre className="bg-background/50 rounded p-2 font-mono text-muted-foreground overflow-x-auto max-h-32">
							{toolInput}
						</pre>
					)}
					{result && (
						<div
							className={cn(
								"rounded p-2 font-mono overflow-x-auto max-h-32",
								result.isError
									? "bg-destructive/10 text-destructive"
									: "bg-muted/20"
							)}
						>
							{result.content}
						</div>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}
