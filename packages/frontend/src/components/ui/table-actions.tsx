import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface TableHeaderActionsProps {
	children: ReactNode
	className?: string
}

/**
 * Container for global action buttons in the table header.
 * Actions are always visible regardless of row selection.
 */
export function TableHeaderActions({
	children,
	className,
}: TableHeaderActionsProps) {
	return (
		<div className={cn("flex items-center gap-item", className)}>
			{children}
		</div>
	)
}

interface TableSelectionActionsProps {
	selectedCount: number
	children: ReactNode
	className?: string
}

/**
 * Toolbar that appears when rows are selected.
 * Contains contextual actions that apply to the selected rows.
 */
export function TableSelectionActions({
	selectedCount,
	children,
	className,
}: TableSelectionActionsProps) {
	if (selectedCount === 0) return null

	return (
		<div
			className={cn(
				"flex items-center gap-card py-item px-component bg-muted/50 border border-border rounded-lg",
				className,
			)}
		>
			<Badge variant="secondary" className="font-normal">
				{selectedCount} selected
			</Badge>
			<div className="h-4 w-px bg-border" />
			<div className="flex items-center gap-item">{children}</div>
		</div>
	)
}

interface SelectionActionButtonProps {
	icon: ReactNode
	label: string
	onClick: () => void
	variant?: "default" | "destructive"
	disabled?: boolean
}

/**
 * A button for use within TableSelectionActions.
 * Standardized styling for selection-based actions.
 */
export function SelectionActionButton({
	icon,
	label,
	onClick,
	variant = "default",
	disabled = false,
}: SelectionActionButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"inline-flex items-center gap-sm px-component py-sm text-sm font-medium rounded-md transition-colors",
				"disabled:pointer-events-none disabled:opacity-50",
				variant === "default" &&
					"text-muted-foreground hover:text-foreground hover:bg-accent",
				variant === "destructive" &&
					"text-destructive hover:text-destructive hover:bg-destructive/10",
			)}
		>
			{icon}
			<span>{label}</span>
		</button>
	)
}

interface HeaderSelectionButtonProps {
	icon: ReactNode
	label: string
	count: number
	onClick: () => void
	variant?: "default" | "destructive"
	disabled?: boolean
}

/**
 * An outline button for selection actions that appears inline with header actions.
 * Shows a count badge inside the button. Used when rows are selected.
 */
export function HeaderSelectionButton({
	icon,
	label,
	count,
	onClick,
	variant = "default",
	disabled = false,
}: HeaderSelectionButtonProps) {
	return (
		<Button
			variant="outline"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"h-9",
				variant === "destructive" && "text-destructive hover:text-destructive",
			)}
		>
			<span className="mr-2">{icon}</span>
			{label}
			<span
				className={cn(
					"ml-1.5 inline-flex items-center justify-center rounded text-[11px] font-medium min-w-[1.125rem] h-[1.125rem] px-1 tabular-nums",
					variant === "destructive"
						? "bg-destructive/15 text-destructive"
						: "bg-muted text-muted-foreground",
				)}
			>
				{count}
			</span>
		</Button>
	)
}

/**
 * A vertical divider for separating groups of header actions.
 */
export function HeaderDivider() {
	return <div className="h-6 w-px bg-border mx-1" />
}
