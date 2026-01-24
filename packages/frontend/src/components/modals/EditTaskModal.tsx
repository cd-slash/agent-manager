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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Task } from "@/types"

interface EditTaskModalProps {
	isOpen: boolean
	onClose: () => void
	task: Task | null
}

export function EditTaskModal({ isOpen, onClose, task }: EditTaskModalProps) {
	const toast = useToast()
	const updateTask = useMutation(api.tasks.update)
	const updateCategory = useMutation(api.tasks.updateCategory)

	const [formData, setFormData] = useState({
		title: "",
		description: "",
		prompt: "",
		tag: "",
		complexity: "",
		category: "backlog" as "backlog" | "todo" | "in-progress" | "done",
	})

	// Reset form when modal opens with a task
	useEffect(() => {
		if (isOpen && task) {
			setFormData({
				title: task.title || "",
				description: task.description || "",
				prompt: task.prompt || "",
				tag: task.tag || "",
				complexity: task.complexity || "",
				category: task.category || "backlog",
			})
		}
	}, [isOpen, task])

	const handleSubmit = async () => {
		if (!task) return

		try {
			const taskId = task.id as unknown as Id<"tasks">

			// Update main task fields
			await updateTask({
				id: taskId,
				title: formData.title,
				description: formData.description,
				prompt: formData.prompt || undefined,
				tag: formData.tag,
				complexity: formData.complexity,
			})

			// Update category if changed
			if (formData.category !== task.category) {
				await updateCategory({
					id: taskId,
					category: formData.category,
				})
			}

			toast.success("Task updated", `"${formData.title}" has been updated`)
			onClose()
		} catch (error) {
			toast.error(
				"Update failed",
				error instanceof Error ? error.message : "Could not update task",
			)
		}
	}

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			onClose()
		}
	}

	if (!task) return null

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Edit Task</DialogTitle>
					<DialogDescription>Update the task details below.</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 pt-4">
					<div className="space-y-2">
						<Label>Title</Label>
						<Input
							value={formData.title}
							onChange={(e) =>
								setFormData({ ...formData, title: e.target.value })
							}
							placeholder="Task title"
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
							placeholder="Task description"
						/>
					</div>
					<div className="space-y-2">
						<Label>Prompt (optional)</Label>
						<Textarea
							value={formData.prompt}
							onChange={(e) =>
								setFormData({ ...formData, prompt: e.target.value })
							}
							className="h-20 resize-none font-mono text-sm"
							placeholder="AI prompt for this task"
						/>
					</div>
					<div className="grid grid-cols-3 gap-4">
						<div className="space-y-2">
							<Label>Status</Label>
							<Select
								value={formData.category}
								onValueChange={(value) =>
									setFormData({
										...formData,
										category: value as typeof formData.category,
									})
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="backlog">Backlog</SelectItem>
									<SelectItem value="todo">To Do</SelectItem>
									<SelectItem value="in-progress">In Progress</SelectItem>
									<SelectItem value="done">Done</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Tag</Label>
							<Input
								value={formData.tag}
								onChange={(e) =>
									setFormData({ ...formData, tag: e.target.value })
								}
								placeholder="feature"
							/>
						</div>
						<div className="space-y-2">
							<Label>Complexity</Label>
							<Select
								value={formData.complexity}
								onValueChange={(value) =>
									setFormData({ ...formData, complexity: value })
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="XS">XS</SelectItem>
									<SelectItem value="S">S</SelectItem>
									<SelectItem value="M">M</SelectItem>
									<SelectItem value="L">L</SelectItem>
									<SelectItem value="XL">XL</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="flex justify-end gap-3 pt-4">
						<Button variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={!formData.title}>
							<Save size={16} className="mr-2" />
							Save Changes
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
