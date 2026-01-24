import { api } from "@agent-manager/convex/api"
import type { Id } from "@agent-manager/convex/dataModel"
import { useMutation, useQuery } from "convex/react"
import {
	FileStack,
	GripVertical,
	Loader2,
	Lock,
	Pencil,
	Plus,
	Star,
	Trash2,
} from "lucide-react"
import { useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { TaskPhase, TaskTemplateDoc } from "@/types"
import { PHASE_DISPLAY_NAMES } from "@/types"

// All available phases
const ALL_PHASES: TaskPhase[] = [
	"requirements",
	"planning",
	"implementation",
	"ai_review",
	"remediation",
	"human_review",
	"merge",
]

interface TemplateFormData {
	name: string
	description: string
	phases: TaskPhase[]
}

const defaultFormData: TemplateFormData = {
	name: "",
	description: "",
	phases: ["requirements", "implementation", "merge"],
}

export function TaskTemplatesSettings() {
	const toast = useToast()
	const templates = useQuery(api.taskTemplates.list) ?? []
	const createTemplate = useMutation(api.taskTemplates.create)
	const updateTemplate = useMutation(api.taskTemplates.update)
	const deleteTemplate = useMutation(api.taskTemplates.remove)
	const setDefaultTemplate = useMutation(api.taskTemplates.setDefault)

	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
	const [editingTemplate, setEditingTemplate] =
		useState<TaskTemplateDoc | null>(null)
	const [deletingTemplate, setDeletingTemplate] =
		useState<TaskTemplateDoc | null>(null)
	const [formData, setFormData] = useState<TemplateFormData>(defaultFormData)
	const [isSaving, setIsSaving] = useState(false)

	const handleOpenCreate = () => {
		setFormData(defaultFormData)
		setIsCreateModalOpen(true)
	}

	const handleOpenEdit = (template: TaskTemplateDoc) => {
		setFormData({
			name: template.name,
			description: template.description,
			phases: template.phases as TaskPhase[],
		})
		setEditingTemplate(template)
	}

	const handleCloseModal = () => {
		setIsCreateModalOpen(false)
		setEditingTemplate(null)
		setFormData(defaultFormData)
	}

	const handlePhaseToggle = (phase: TaskPhase, checked: boolean) => {
		if (checked) {
			// Add phase in the correct order
			const newPhases = ALL_PHASES.filter(
				(p) => formData.phases.includes(p) || p === phase,
			)
			setFormData({ ...formData, phases: newPhases })
		} else {
			// Remove phase (but keep at least requirements and one other)
			const newPhases = formData.phases.filter((p) => p !== phase)
			if (newPhases.length >= 2) {
				setFormData({ ...formData, phases: newPhases })
			} else {
				toast.error("Invalid template", "Template must have at least 2 phases")
			}
		}
	}

	const handleSave = async () => {
		if (!formData.name.trim()) {
			toast.error("Name required", "Please enter a template name")
			return
		}
		if (formData.phases.length < 2) {
			toast.error("Invalid phases", "Template must have at least 2 phases")
			return
		}
		if (!formData.phases.includes("requirements")) {
			toast.error(
				"Requirements required",
				"Template must include the requirements phase",
			)
			return
		}
		if (!formData.phases.includes("merge")) {
			toast.error("Merge required", "Template must include the merge phase")
			return
		}

		setIsSaving(true)
		try {
			if (editingTemplate) {
				await updateTemplate({
					id: editingTemplate._id as Id<"taskTemplates">,
					name: formData.name,
					description: formData.description,
					phases: editingTemplate.isBuiltin ? undefined : formData.phases,
				})
				toast.success("Template updated", `"${formData.name}" has been updated`)
			} else {
				await createTemplate({
					name: formData.name,
					description: formData.description,
					phases: formData.phases,
				})
				toast.success("Template created", `"${formData.name}" has been created`)
			}
			handleCloseModal()
		} catch (error) {
			toast.error(
				"Save failed",
				error instanceof Error ? error.message : "Failed to save template",
			)
		} finally {
			setIsSaving(false)
		}
	}

	const handleDelete = async () => {
		if (!deletingTemplate) return

		try {
			await deleteTemplate({ id: deletingTemplate._id as Id<"taskTemplates"> })
			toast.success(
				"Template deleted",
				`"${deletingTemplate.name}" has been deleted`,
			)
			setDeletingTemplate(null)
		} catch (error) {
			toast.error(
				"Delete failed",
				error instanceof Error ? error.message : "Failed to delete template",
			)
		}
	}

	const handleSetDefault = async (template: TaskTemplateDoc) => {
		try {
			await setDefaultTemplate({ id: template._id as Id<"taskTemplates"> })
			toast.success(
				"Default updated",
				`"${template.name}" is now the default template`,
			)
		} catch (error) {
			toast.error(
				"Update failed",
				error instanceof Error ? error.message : "Failed to set default",
			)
		}
	}

	return (
		<section>
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center">
					<FileStack size={16} className="mr-2" /> Task Templates
				</h3>
				<Button variant="outline" size="sm" onClick={handleOpenCreate}>
					<Plus size={14} className="mr-2" />
					New Template
				</Button>
			</div>

			<div className="bg-surface border border-border rounded-lg p-4">
				<p className="text-sm text-muted-foreground mb-4">
					Task templates define the workflow phases for different types of
					tasks. Choose which phases to include and in what order tasks should
					progress.
				</p>

				{templates.length === 0 ? (
					<div className="text-center py-8">
						<FileStack
							size={48}
							className="mx-auto mb-4 text-muted-foreground opacity-50"
						/>
						<p className="text-sm text-muted-foreground">
							No templates configured yet. Run the seed function in the Convex
							dashboard to initialize built-in templates, or create a new one.
						</p>
					</div>
				) : (
					<div className="space-y-3">
						{templates.map((template) => (
							<div
								key={template._id}
								className="bg-background border border-border rounded-lg p-4"
							>
								<div className="flex items-start justify-between mb-3">
									<div className="flex items-center gap-2">
										<h4 className="font-medium text-foreground">
											{template.name}
										</h4>
										{template.isDefault && (
											<Badge variant="default" className="text-xs">
												<Star size={10} className="mr-1" />
												Default
											</Badge>
										)}
										{template.isBuiltin && (
											<Badge variant="secondary" className="text-xs">
												<Lock size={10} className="mr-1" />
												Built-in
											</Badge>
										)}
									</div>
									<div className="flex items-center gap-1">
										{!template.isDefault && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleSetDefault(template)}
												title="Set as default"
											>
												<Star size={14} />
											</Button>
										)}
										<Button
											variant="ghost"
											size="sm"
											onClick={() => handleOpenEdit(template)}
											title="Edit template"
										>
											<Pencil size={14} />
										</Button>
										{!template.isBuiltin && !template.isDefault && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setDeletingTemplate(template)}
												title="Delete template"
												className="text-destructive hover:text-destructive"
											>
												<Trash2 size={14} />
											</Button>
										)}
									</div>
								</div>
								<p className="text-sm text-muted-foreground mb-3">
									{template.description}
								</p>
								<div className="flex flex-wrap gap-1.5">
									{(template.phases as TaskPhase[]).map((phase, index) => (
										<div key={phase} className="flex items-center">
											<Badge variant="outline" className="text-xs">
												{PHASE_DISPLAY_NAMES[phase]}
											</Badge>
											{index < template.phases.length - 1 && (
												<span className="text-muted-foreground mx-1">→</span>
											)}
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Create/Edit Modal */}
			<Dialog
				open={isCreateModalOpen || !!editingTemplate}
				onOpenChange={(open) => !open && handleCloseModal()}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle className="flex items-center">
							{editingTemplate ? (
								<>
									<Pencil size={20} className="mr-2 text-primary" />
									Edit Template
								</>
							) : (
								<>
									<Plus size={20} className="mr-2 text-primary" />
									New Template
								</>
							)}
						</DialogTitle>
					</DialogHeader>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label>Template Name</Label>
							<Input
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								placeholder="e.g., Quick Fix, Full Review"
								disabled={editingTemplate?.isBuiltin}
							/>
						</div>

						<div className="space-y-2">
							<Label>Description</Label>
							<Textarea
								value={formData.description}
								onChange={(e) =>
									setFormData({ ...formData, description: e.target.value })
								}
								placeholder="Describe when to use this template..."
								rows={2}
							/>
						</div>

						<div className="space-y-2">
							<Label>Phases</Label>
							{editingTemplate?.isBuiltin ? (
								<p className="text-sm text-muted-foreground mb-2">
									Built-in templates cannot have their phases modified.
								</p>
							) : (
								<p className="text-sm text-muted-foreground mb-2">
									Select which phases to include. Tasks will progress through
									phases in order.
								</p>
							)}
							<div className="bg-background border border-border rounded-lg p-3 space-y-2">
								{ALL_PHASES.map((phase) => {
									const isIncluded = formData.phases.includes(phase)
									const isRequired =
										phase === "requirements" || phase === "merge"
									const isDisabled = editingTemplate?.isBuiltin || isRequired

									return (
										<div
											key={phase}
											className={`flex items-center gap-3 p-2 rounded ${
												isIncluded ? "bg-primary/5" : ""
											}`}
										>
											<GripVertical
												size={14}
												className="text-muted-foreground"
											/>
											<Checkbox
												checked={isIncluded}
												onCheckedChange={(checked) =>
													handlePhaseToggle(phase, !!checked)
												}
												disabled={isDisabled}
											/>
											<span
												className={`text-sm ${isIncluded ? "text-foreground" : "text-muted-foreground"}`}
											>
												{PHASE_DISPLAY_NAMES[phase]}
											</span>
											{isRequired && (
												<span className="text-xs text-muted-foreground">
													(required)
												</span>
											)}
										</div>
									)
								})}
							</div>
						</div>

						<div className="bg-surface border border-border rounded-lg p-3">
							<Label className="text-xs text-muted-foreground uppercase">
								Preview
							</Label>
							<div className="flex flex-wrap gap-1.5 mt-2">
								{formData.phases.map((phase, index) => (
									<div key={phase} className="flex items-center">
										<Badge variant="outline" className="text-xs">
											{PHASE_DISPLAY_NAMES[phase]}
										</Badge>
										{index < formData.phases.length - 1 && (
											<span className="text-muted-foreground mx-1">→</span>
										)}
									</div>
								))}
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button variant="ghost" onClick={handleCloseModal}>
							Cancel
						</Button>
						<Button onClick={handleSave} disabled={isSaving}>
							{isSaving ? (
								<>
									<Loader2 size={14} className="mr-2 animate-spin" />
									Saving...
								</>
							) : editingTemplate ? (
								"Save Changes"
							) : (
								"Create Template"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation */}
			<Dialog
				open={!!deletingTemplate}
				onOpenChange={(open) => !open && setDeletingTemplate(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Template</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete "{deletingTemplate?.name}"? This
							action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setDeletingTemplate(null)}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={handleDelete}>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	)
}
