import { api } from "@agent-manager/convex/api"
import { useMutation, useQuery } from "convex/react"
import { RefreshCw, RotateCcw, Save, Settings2 } from "lucide-react"
import { useEffect, useState } from "react"
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
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PHASE_DISPLAY_NAMES, type TaskId, type TaskPhase } from "@/types"

// Available models
const MODELS = [
	{ value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
	{ value: "claude-opus-4-20250514", label: "Claude Opus 4" },
	{ value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
	{ value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
]

// Permission modes
const PERMISSION_MODES = [
	{ value: "default", label: "Default" },
	{ value: "plan", label: "Plan Mode" },
	{ value: "accept_edits", label: "Accept Edits" },
	{ value: "full_auto", label: "Full Auto" },
]

interface PhaseConfigPanelProps {
	taskId: TaskId
	phase: TaskPhase
	isOpen: boolean
	onClose: () => void
	readOnly?: boolean
}

export function PhaseConfigPanel({
	taskId,
	phase,
	isOpen,
	onClose,
	readOnly = false,
}: PhaseConfigPanelProps) {
	const toast = useToast()
	const [isSaving, setIsSaving] = useState(false)
	const [isDirty, setIsDirty] = useState(false)
	const [useDefault, setUseDefault] = useState(true)

	// Form state
	const [model, setModel] = useState("claude-sonnet-4-20250514")
	const [permissionMode, setPermissionMode] = useState("default")
	const [promptTemplate, setPromptTemplate] = useState("")
	const [enabled, setEnabled] = useState(true)

	// Fetch effective config
	const effectiveConfig = useQuery(api.phaseConfigs.getEffectiveConfig, {
		taskId,
		phase,
	})
	const builtinDefaults = useQuery(api.phaseConfigs.getBuiltinDefaults)

	// Mutations
	const upsertOverride = useMutation(api.phaseConfigs.upsertTaskOverride)
	const deleteOverride = useMutation(api.phaseConfigs.deleteTaskOverride)

	// Sync state with fetched config
	useEffect(() => {
		if (effectiveConfig) {
			setModel(effectiveConfig.model)
			setPermissionMode(effectiveConfig.permissionMode)
			setPromptTemplate(effectiveConfig.promptTemplate)
			setEnabled(effectiveConfig.enabled)
			setUseDefault(!effectiveConfig.isOverride)
			setIsDirty(false)
		}
	}, [effectiveConfig])

	const handleSave = async () => {
		setIsSaving(true)
		try {
			if (useDefault) {
				// Delete override to use default
				await deleteOverride({ taskId, phase })
				toast.success(
					"Configuration updated",
					"Using default settings for this phase",
				)
			} else {
				// Save override
				await upsertOverride({
					taskId,
					phase,
					provider: "anthropic",
					model,
					permissionMode,
					promptTemplate,
					enabled,
				})
				toast.success(
					"Configuration saved",
					"Custom settings applied for this phase",
				)
			}
			setIsDirty(false)
		} catch (error) {
			toast.error(
				"Failed to save",
				error instanceof Error ? error.message : "Failed to save configuration",
			)
		} finally {
			setIsSaving(false)
		}
	}

	const handleReset = () => {
		if (effectiveConfig) {
			setModel(effectiveConfig.model)
			setPermissionMode(effectiveConfig.permissionMode)
			setPromptTemplate(effectiveConfig.promptTemplate)
			setEnabled(effectiveConfig.enabled)
			setUseDefault(!effectiveConfig.isOverride)
			setIsDirty(false)
		}
	}

	const handleResetToBuiltin = () => {
		const builtinConfig =
			builtinDefaults?.configs?.[phase as keyof typeof builtinDefaults.configs]
		const builtinPrompt =
			builtinDefaults?.prompts?.[phase as keyof typeof builtinDefaults.prompts]

		if (builtinConfig) {
			setModel(builtinConfig.model)
			setPermissionMode(builtinConfig.permissionMode)
		}
		if (builtinPrompt) {
			setPromptTemplate(builtinPrompt)
		}
		setIsDirty(true)
	}

	const handleChange = () => {
		setIsDirty(true)
	}

	return (
		<Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
				<SheetHeader>
					<SheetTitle className="flex items-center gap-2">
						<Settings2 size={18} />
						{PHASE_DISPLAY_NAMES[phase]} Configuration
					</SheetTitle>
					<SheetDescription>
						{readOnly
							? "View the configuration used for this phase"
							: "Configure the agent settings for this phase. These settings override the global defaults."}
					</SheetDescription>
				</SheetHeader>

				<div className="mt-6 space-y-6">
					{!readOnly && (
						<div className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg">
							<div>
								<div className="font-medium text-sm">Use Default Settings</div>
								<div className="text-xs text-muted-foreground">
									Use the global default configuration for this phase
								</div>
							</div>
							<Switch
								checked={useDefault}
								onCheckedChange={(checked) => {
									setUseDefault(checked)
									handleChange()
								}}
							/>
						</div>
					)}

					<div className={!useDefault ? "" : "opacity-50 pointer-events-none"}>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label>Model</Label>
								<Select
									value={model}
									onValueChange={(value) => {
										setModel(value)
										handleChange()
									}}
									disabled={readOnly || useDefault}
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
									disabled={readOnly || useDefault}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{PERMISSION_MODES.map((m) => (
											<SelectItem key={m.value} value={m.value}>
												{m.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="space-y-2 mt-4">
							<div className="flex items-center justify-between">
								<Label>Prompt Template</Label>
								{!readOnly && !useDefault && (
									<Button
										variant="ghost"
										size="sm"
										onClick={handleResetToBuiltin}
										className="text-xs"
									>
										<RotateCcw size={12} className="mr-1" />
										Reset to Builtin
									</Button>
								)}
							</div>
							<Textarea
								value={promptTemplate}
								onChange={(e) => {
									setPromptTemplate(e.target.value)
									handleChange()
								}}
								rows={12}
								className="font-mono text-xs"
								disabled={readOnly || useDefault}
								placeholder="Enter the prompt template for this phase..."
							/>
							<p className="text-xs text-muted-foreground">
								Variables: {"{{task.title}}"}, {"{{task.description}}"},{" "}
								{"{{task.id}}"}, {"{{pr.number}}"}, {"{{pr.branch}}"}
							</p>
						</div>

						{!readOnly && !useDefault && (
							<div className="flex items-center justify-between pt-4">
								<div className="flex items-center gap-2">
									<Switch
										id="enabled"
										checked={enabled}
										onCheckedChange={(checked) => {
											setEnabled(checked)
											handleChange()
										}}
									/>
									<Label htmlFor="enabled" className="text-sm">
										Phase Enabled
									</Label>
								</div>
							</div>
						)}
					</div>

					{effectiveConfig?.isOverride && (
						<div className="text-xs text-muted-foreground bg-surface border border-border rounded p-2">
							This task has custom settings for this phase. Toggle "Use Default
							Settings" to revert to global defaults.
						</div>
					)}

					{!readOnly && (
						<div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
							<Button
								variant="outline"
								onClick={handleReset}
								disabled={!isDirty}
							>
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
					)}
				</div>
			</SheetContent>
		</Sheet>
	)
}
