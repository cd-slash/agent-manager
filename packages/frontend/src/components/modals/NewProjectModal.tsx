import { ArrowRight, Sparkles } from "lucide-react"
import { useState } from "react"
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

interface NewProjectModalProps {
	isOpen: boolean
	onClose: () => void
	onCreate: (project: {
		name: string
		description: string
		repo: string
		branch?: string
	}) => void
}

export function NewProjectModal({
	isOpen,
	onClose,
	onCreate,
}: NewProjectModalProps) {
	const [project, setProject] = useState({
		name: "",
		description: "",
		repo: "",
		branch: "main",
	})

	const handleSubmit = () => {
		onCreate({
			name: project.name,
			description: project.description,
			repo: project.repo,
			branch: project.branch || undefined,
		})
		setProject({ name: "", description: "", repo: "", branch: "main" })
	}

	const isValidRepo = project.repo.includes("/")

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			onClose()
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-2xl p-0 overflow-hidden">
				<div className="p-page">
					<DialogHeader className="mb-page text-center">
						<div className="flex justify-center mb-card">
							<div className="inline-flex items-center justify-center p-component bg-primary/10 rounded-xl">
								<Sparkles className="text-primary w-8 h-8" />
							</div>
						</div>
						<DialogTitle className="text-3xl">Create New Project</DialogTitle>
						<DialogDescription>
							Create a new project to organize your tasks.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-section">
						<div className="space-y-item">
							<Label>Project Name</Label>
							<Input
								value={project.name}
								onChange={(e) =>
									setProject({ ...project, name: e.target.value })
								}
								placeholder="e.g., My Awesome SaaS"
							/>
						</div>
						<div className="space-y-item">
							<Label>Description</Label>
							<Textarea
								value={project.description}
								onChange={(e) =>
									setProject({ ...project, description: e.target.value })
								}
								className="h-32 resize-none"
								placeholder="Describe features, tech stack, and goals..."
							/>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-item">
								<Label>
									GitHub Repository <span className="text-destructive">*</span>
								</Label>
								<Input
									value={project.repo}
									onChange={(e) =>
										setProject({ ...project, repo: e.target.value })
									}
									placeholder="owner/repo"
									className={
										project.repo && !isValidRepo ? "border-destructive" : ""
									}
								/>
								{project.repo && !isValidRepo ? (
									<p className="text-xs text-destructive">
										Must be in format "owner/repo"
									</p>
								) : (
									<p className="text-xs text-muted-foreground">
										Repository to clone when creating containers
									</p>
								)}
							</div>
							<div className="space-y-item">
								<Label>Default Branch</Label>
								<Input
									value={project.branch}
									onChange={(e) =>
										setProject({ ...project, branch: e.target.value })
									}
									placeholder="main"
								/>
								<p className="text-xs text-muted-foreground">
									Branch to use for task containers
								</p>
							</div>
						</div>
						<Button
							onClick={handleSubmit}
							disabled={!project.name || !project.description || !isValidRepo}
							className="w-full py-4"
							size="lg"
						>
							<span>Create Project</span>
							<ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
