import { api } from "@agent-manager/convex/api"
import { useMutation, useQuery } from "convex/react"
import {
	Bot,
	ChevronDown,
	ChevronUp,
	RefreshCw,
	RotateCcw,
	Save,
} from "lucide-react"
import { useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
	AGENT_PHASES,
	PHASE_DESCRIPTIONS,
	PHASE_DISPLAY_NAMES,
	type TaskPhase,
} from "@/types"

// Available models
const MODELS = [
	{ value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
	{ value: "claude-opus-4-20250514", label: "Claude Opus 4" },
	{ value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
	{ value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
]

// Permission modes
const PERMISSION_MODES = [
	{ value: "default", label: "Default", description: "Standard permissions" },
	{
		value: "plan",
		label: "Plan Mode",
		description: "Agent creates plan before executing",
	},
	{
		value: "accept_edits",
		label: "Accept Edits",
		description: "Auto-accept file edits",
	},
	{
		value: "full_auto",
		label: "Full Auto",
		description: "Auto-accept all actions",
	},
]

interface PhaseConfigCardProps {
	phase: TaskPhase
	config: {
		provider?: string
		model?: string
		permissionMode?: string
		promptTemplate?: string
		enabled?: boolean
		isBuiltin?: boolean
	} | null
	builtinPrompt: string | null
	onSave: (config: {
		provider: string
		model: string
		permissionMode: string
		promptTemplate: string
		enabled: boolean
	}) => Promise<void>
	isSaving: boolean
}

function PhaseConfigCard({
	phase,
	config,
	builtinPrompt,
	onSave,
	isSaving,
}: PhaseConfigCardProps) {
	const [isExpanded, setIsExpanded] = useState(false)
	const [model, setModel] = useState(
		config?.model || "claude-sonnet-4-20250514",
	)
	const [permissionMode, setPermissionMode] = useState(
		config?.permissionMode || "default",
	)
	const [promptTemplate, setPromptTemplate] = useState(
		config?.promptTemplate || builtinPrompt || "",
	)
	const [enabled, setEnabled] = useState(config?.enabled ?? true)
	const [isDirty, setIsDirty] = useState(false)

	const handleSave = async () => {
		await onSave({
			provider: "anthropic",
			model,
			permissionMode,
			promptTemplate,
			enabled,
		})
		setIsDirty(false)
	}

	const handleReset = () => {
		setModel(config?.model || "claude-sonnet-4-20250514")
		setPermissionMode(config?.permissionMode || "default")
		setPromptTemplate(config?.promptTemplate || builtinPrompt || "")
		setEnabled(config?.enabled ?? true)
		setIsDirty(false)
	}

	const handleChange = () => {
		setIsDirty(true)
	}

	return (
		<div className="bg-surface border border-border rounded-lg overflow-hidden">
			<button
				type="button"
				className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-surface/80 transition-colors text-left"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<div className="flex items-center gap-3">
					<Bot size={18} className="text-muted-foreground" />
					<div>
						<div className="flex items-center gap-2">
							<span className="font-medium text-foreground">
								{PHASE_DISPLAY_NAMES[phase]} Agent
							</span>
							{config?.isBuiltin && (
								<span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
									BUILTIN
								</span>
							)}
						</div>
						<div className="text-xs text-muted-foreground">
							{PHASE_DESCRIPTIONS[phase]}
						</div>
					</div>
				</div>
				<div className="flex items-center gap-3">
					{/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation only */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only */}
					<div
						className="flex items-center gap-2"
						onClick={(e) => e.stopPropagation()}
					>
						<Switch
							checked={enabled}
							onCheckedChange={(checked) => {
								setEnabled(checked)
								handleChange()
							}}
						/>
						<span className="text-xs text-muted-foreground">
							{enabled ? "Enabled" : "Disabled"}
						</span>
					</div>
					{isExpanded ? (
						<ChevronUp size={18} className="text-muted-foreground" />
					) : (
						<ChevronDown size={18} className="text-muted-foreground" />
					)}
				</div>
			</button>

			{isExpanded && (
				<div className="border-t border-border p-4 space-y-4 bg-background/50">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Model</Label>
							<Select
								value={model}
								onValueChange={(value) => {
									setModel(value)
									handleChange()
								}}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{MODELS.map((m) => (
										<SelectItem key={m.value} value={m.value}>
											{m.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Permission Mode</Label>
							<Select
								value={permissionMode}
								onValueChange={(value) => {
									setPermissionMode(value)
									handleChange()
								}}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PERMISSION_MODES.map((m) => (
										<SelectItem key={m.value} value={m.value}>
											<div className="flex flex-col">
												<span>{m.label}</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label>Prompt Template</Label>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setPromptTemplate(builtinPrompt || "")
									handleChange()
								}}
								className="text-xs"
							>
								<RotateCcw size={12} className="mr-1" />
								Reset to Default
							</Button>
						</div>
						<Textarea
							value={promptTemplate}
							onChange={(e) => {
								setPromptTemplate(e.target.value)
								handleChange()
							}}
							rows={8}
							className="font-mono text-xs"
							placeholder="Enter the prompt template for this phase..."
						/>
						<p className="text-xs text-muted-foreground">
							Available variables: {"{{task.title}}"}, {"{{task.description}}"},{" "}
							{"{{task.id}}"}, {"{{pr.number}}"}, {"{{pr.branch}}"}
						</p>
					</div>

					<div className="flex items-center justify-end gap-2 pt-2">
						<Button variant="outline" onClick={handleReset} disabled={!isDirty}>
							Cancel
						</Button>
						<Button onClick={handleSave} disabled={!isDirty || isSaving}>
							{isSaving ? (
								<>
									<RefreshCw size={14} className="mr-2 animate-spin" />
									Saving...
								</>
							) : (
								<>
									<Save size={14} className="mr-2" />
									Save
								</>
							)}
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

export function PhaseDefaultsSettings() {
	const toast = useToast()
	const [savingPhase, setSavingPhase] = useState<string | null>(null)

	// Fetch configs
	const defaultConfigs = useQuery(api.phaseConfigs.getAllDefaults)
	const builtinDefaults = useQuery(api.phaseConfigs.getBuiltinDefaults)

	// Mutation
	const upsertDefault = useMutation(api.phaseConfigs.upsertDefault)

	const handleSavePhaseConfig = async (
		phase: TaskPhase,
		config: {
			provider: string
			model: string
			permissionMode: string
			promptTemplate: string
			enabled: boolean
		},
	) => {
		setSavingPhase(phase)
		try {
			await upsertDefault({
				phase,
				...config,
			})
			toast.success(
				"Configuration saved",
				`${PHASE_DISPLAY_NAMES[phase]} agent settings updated`,
			)
		} catch (error) {
			toast.error(
				"Failed to save",
				error instanceof Error ? error.message : "Failed to save configuration",
			)
		} finally {
			setSavingPhase(null)
		}
	}

	return (
		<section>
			<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
				<Bot size={16} className="mr-2" /> Agent Phase Defaults
			</h3>
			<p className="text-sm text-muted-foreground mb-4">
				Configure the default model and prompt for each agent phase. These
				settings can be overridden per-task.
			</p>
			<div className="space-y-3">
				{AGENT_PHASES.map((phase) => (
					<PhaseConfigCard
						key={phase}
						phase={phase}
						config={defaultConfigs?.[phase] || null}
						builtinPrompt={
							builtinDefaults?.prompts?.[
								phase as keyof typeof builtinDefaults.prompts
							] || null
						}
						onSave={(config) => handleSavePhaseConfig(phase, config)}
						isSaving={savingPhase === phase}
					/>
				))}
			</div>
		</section>
	)
}
