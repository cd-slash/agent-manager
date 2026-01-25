import { useState, useMemo, useRef, useEffect } from "react"
import { ChevronRight, ChevronDown, Terminal, Check, X } from "lucide-react"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

// Convert a key from camelCase/snake_case to Title Case
function formatKeyName(key: string): string {
	return key
		.replace(/_/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/\b\w/g, (c) => c.toUpperCase())
}

// Parse a string value, converting escape sequences to actual characters
function parseStringValue(value: unknown): string {
	if (typeof value === "string") {
		// Parse escape sequences like \n, \t, etc.
		try {
			if (value.includes("\\n") || value.includes("\\t") || value.includes("\\r")) {
				return value
					.replace(/\\n/g, "\n")
					.replace(/\\t/g, "\t")
					.replace(/\\r/g, "\r")
			}
			return value
		} catch {
			return value
		}
	}
	if (value === null || value === undefined) {
		return String(value)
	}
	if (typeof value === "object") {
		return JSON.stringify(value, null, 2)
	}
	return String(value)
}

// Expandable key-value row component (renders as grid row via display:contents)
function ExpandableValue({ label, value, resetKey }: { label: string; value: string; resetKey: number }) {
	const [isExpanded, setIsExpanded] = useState(false)
	const [isTruncated, setIsTruncated] = useState(false)
	const textRef = useRef<HTMLSpanElement>(null)

	// Reset expanded state when resetKey changes (parent collapsed)
	useEffect(() => {
		setIsExpanded(false)
	}, [resetKey])

	// Check if text is truncated
	useEffect(() => {
		const checkTruncation = () => {
			if (textRef.current) {
				setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth)
			}
		}
		checkTruncation()
		// Recheck on window resize
		window.addEventListener("resize", checkTruncation)
		return () => window.removeEventListener("resize", checkTruncation)
	}, [value, isExpanded])

	// Check if value has newlines (always needs expansion if so)
	const hasNewlines = value.includes("\n")
	const showExpandButton = !isExpanded && (isTruncated || hasNewlines)

	return (
		<>
			{/* Key column */}
			<span className="text-muted-foreground py-0.5 pr-2">{label}:</span>
			{/* Value column */}
			<div className="py-0.5 min-w-0">
				{isExpanded ? (
					<span className="text-foreground whitespace-pre-wrap break-words">
						{value}
					</span>
				) : (
					<div className="flex items-center gap-1 min-w-0">
						<span
							ref={textRef}
							className="text-foreground truncate flex-1 min-w-0 whitespace-nowrap"
						>
							{hasNewlines ? value.split("\n")[0] : value}
						</span>
						{showExpandButton && (
							<button
								type="button"
								onClick={() => setIsExpanded(true)}
								className="text-primary hover:underline shrink-0"
							>
								show more
							</button>
						)}
					</div>
				)}
			</div>
		</>
	)
}

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
	// Increment this when closing to reset all ExpandableValue components
	const [resetKey, setResetKey] = useState(0)

	const handleOpenChange = (open: boolean) => {
		setIsOpen(open)
		if (!open) {
			// Reset all expanded values when closing
			setResetKey((k) => k + 1)
		}
	}

	// Parse tool input as JSON if possible
	const parsedInput = useMemo(() => {
		if (!toolInput) return null
		try {
			const parsed = JSON.parse(toolInput)
			if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>
			}
			return null
		} catch {
			return null
		}
	}, [toolInput])

	return (
		<Collapsible open={isOpen} onOpenChange={handleOpenChange}>
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
				<div className="mt-1 text-xs space-y-1 px-2">
					{toolInput && (
						<div className="bg-background/50 rounded p-2 font-mono text-muted-foreground max-h-48 scrollbar-styled scrollbar-no-margin overflow-x-hidden">
							{parsedInput ? (
								<div className="grid grid-cols-[auto_1fr] items-start">
									{Object.entries(parsedInput).map(([key, value]) => (
										<ExpandableValue
											key={key}
											label={formatKeyName(key)}
											value={parseStringValue(value)}
											resetKey={resetKey}
										/>
									))}
								</div>
							) : (
								<pre className="whitespace-pre-wrap break-words">
									{toolInput}
								</pre>
							)}
						</div>
					)}
					{result && (
						<div
							className={cn(
								"rounded p-2 font-mono max-h-32 whitespace-pre-wrap break-words scrollbar-styled scrollbar-no-margin overflow-x-hidden",
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
