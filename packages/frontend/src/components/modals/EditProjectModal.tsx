import { api } from "@agent-manager/convex/api"
import type { Id } from "@agent-manager/convex/dataModel"
import { useMutation } from "convex/react"
import { Save } from "lucide-react"
import { useEffect, useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Project } from "@/types"

interface EditProjectModalProps {
	isOpen: boolean
	onClose: () => void
	projects: Project[]
}

export function EditProjectModal({
	isOpen,
	onClose,
	projects,
}: EditProjectModalProps) {
	const toast = useToast()
	const updateProject = useMutation(api.projects.update)
	const isBulk = projects.length > 1
	const singleProject = projects.length === 1 ? projects[0] : null

	// For single edit, pre-populate; for bulk, leave empty (only filled fields update)
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		repo: "",
		branch: "",
	})

	// Reset form when modal opens with new projects
	useEffect(() => {
		if (isOpen && singleProject) {
			setFormData({
				name: singleProject.name || "",
				description: singleProject.description || "",
				repo: singleProject.repo || "",
				branch: singleProject.branch || "",
			})
		} else if (isOpen && isBulk) {
			setFormData({ name: "", description: "", repo: "", branch: "" })
		}
	}, [isOpen, singleProject, isBulk])

	const handleSubmit = async () => {
		try {
			for (const project of projects) {
				const updates: {
					id: Id<"projects">
					name?: string
					description?: string
					repo?: string
					branch?: string
				} = {
					id: project.id as Id<"projects">,
				}

				// For single edit, always include all fields
				// For bulk edit, only include non-empty fields
				if (!isBulk || formData.name) {
					updates.name = formData.name || undefined
				}
				if (!isBulk || formData.description) {
					updates.description = formData.description || undefined
				}
				if (!isBulk || formData.repo) {
					updates.repo = formData.repo || undefined
				}
				if (!isBulk || formData.branch) {
					updates.branch = formData.branch || undefined
				}

				// Only call update if there are actual updates
				if (Object.keys(updates).length > 1) {
					await updateProject(updates)
				}
			}

			toast.success(
				isBulk ? "Projects updated" : "Project updated",
				isBulk
					? `Successfully updated ${projects.length} projects`
					: `Successfully updated "${formData.name}"`,
			)
			onClose()
		} catch (error) {
			toast.error(
				"Update failed",
				error instanceof Error ? error.message : "Could not update projects",
			)
		}
	}

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			onClose()
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{isBulk ? `Edit ${projects.length} Projects` : "Edit Project"}
					</DialogTitle>
					<DialogDescription>
						{isBulk
							? "Only filled fields will be updated across all selected projects."
							: "Update the project details below."}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 pt-4">
					<div className="space-y-2">
						<Label>Project Name</Label>
						<Input
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							placeholder={
								isBulk ? "Leave empty to keep existing" : "Project name"
							}
						/>
					</div>
					<div className="space-y-2">
						<Label>Description</Label>
						<Textarea
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							className="h-24 resize-none"
							placeholder={
								isBulk ? "Leave empty to keep existing" : "Project description"
							}
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>GitHub Repository</Label>
							<Input
								value={formData.repo}
								onChange={(e) =>
									setFormData({ ...formData, repo: e.target.value })
								}
								placeholder="owner/repo"
							/>
						</div>
						<div className="space-y-2">
							<Label>Default Branch</Label>
							<Input
								value={formData.branch}
								onChange={(e) =>
									setFormData({ ...formData, branch: e.target.value })
								}
								placeholder="main"
							/>
						</div>
					</div>
					<div className="flex justify-end gap-3 pt-4">
						<Button variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={!isBulk && !formData.name}>
							<Save size={16} className="mr-2" />
							{isBulk ? "Update All" : "Save Changes"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
