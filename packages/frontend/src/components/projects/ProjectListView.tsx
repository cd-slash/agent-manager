import { api } from "@agent-manager/convex/api"
import type { Id } from "@agent-manager/convex/dataModel"
import type { ColumnDef } from "@tanstack/react-table"
import { useMutation } from "convex/react"
import { Clock, Edit2, Layout, List, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { GenericListView } from "@/components/layouts/GenericListView"
import { EditProjectModal } from "@/components/modals/EditProjectModal"
import { useToast } from "@/components/ToastProvider"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
	HeaderDivider,
	HeaderSelectionButton,
} from "@/components/ui/table-actions"
import type { Project } from "@/types"

// Format timestamp to relative time
const formatTime = (timestamp: number): string => {
	const now = Date.now()
	const diff = now - timestamp
	const minutes = Math.floor(diff / 60000)
	const hours = Math.floor(diff / 3600000)
	const days = Math.floor(diff / 86400000)

	if (minutes < 1) return "Just now"
	if (minutes < 60) return `${minutes}m ago`
	if (hours < 24) return `${hours}h ago`
	return `${days}d ago`
}

interface ProjectListViewProps {
	projects: Project[]
	onSelectProject: (project: Project) => void
	onNewProject: () => void
}

export function ProjectListView({
	projects,
	onSelectProject,
	onNewProject,
}: ProjectListViewProps) {
	const [selectedProjects, setSelectedProjects] = useState<Project[]>([])
	const [clearSelectionFn, setClearSelectionFn] = useState<(() => void) | null>(
		null,
	)
	const [isEditModalOpen, setIsEditModalOpen] = useState(false)
	const toast = useToast()
	const deleteProject = useMutation(api.projects.deleteProject)

	const handleSelectionChange = (
		rows: Project[],
		clearSelection: () => void,
	) => {
		setSelectedProjects(rows)
		setClearSelectionFn(() => clearSelection)
	}

	const handleDeleteSelected = async () => {
		try {
			for (const project of selectedProjects) {
				await deleteProject({ id: project.id as Id<"projects"> })
			}
			toast.success(
				"Projects deleted",
				`Successfully deleted ${selectedProjects.length} project${selectedProjects.length > 1 ? "s" : ""}`,
			)
		} catch (error) {
			toast.error(
				"Delete failed",
				error instanceof Error ? error.message : "Could not delete projects",
			)
		}
		clearSelectionFn?.()
	}

	const columns: ColumnDef<Project>[] = useMemo(
		() => [
			{
				accessorKey: "name",
				header: "Project Name",
				size: 250,
				cell: ({ row }) => (
					<div className="flex items-center font-medium text-foreground whitespace-nowrap max-w-[200px]">
						<Layout size={16} className="mr-3 text-feature-blue shrink-0" />
						<span className="truncate">{row.getValue("name")}</span>
					</div>
				),
			},
			{
				accessorKey: "description",
				header: "Description",
				size: 300,
				cell: ({ row }) => (
					<span className="text-muted-foreground max-w-xs truncate block">
						{row.getValue("description")}
					</span>
				),
			},
			{
				id: "progress",
				header: "Progress",
				size: 192,
				cell: ({ row }) => {
					const project = row.original
					const done = project.tasks.filter((t) => t.category === "done").length
					const total = project.tasks.length
					const progress = total > 0 ? Math.round((done / total) * 100) : 0
					return (
						<div className="flex items-center space-x-3">
							<Progress value={progress} className="flex-1" />
							<span className="text-xs text-muted-foreground font-medium w-8 text-right">
								{progress}%
							</span>
						</div>
					)
				},
			},
			{
				id: "tasks",
				header: "Tasks",
				cell: ({ row }) => {
					const total = row.original.tasks.length
					return (
						<div className="flex items-center text-muted-foreground">
							<List size={14} className="mr-1.5 text-muted-foreground" />
							{total}
						</div>
					)
				},
			},
			{
				id: "updated",
				header: "Updated",
				cell: ({ row }) => {
					const updatedAt = row.original.updatedAt
					return (
						<div className="flex items-center text-muted-foreground text-xs">
							<Clock size={14} className="mr-1.5 text-muted-foreground" />
							{updatedAt ? formatTime(updatedAt) : "—"}
						</div>
					)
				},
			},
		],
		[],
	)

	const selectedCount = selectedProjects.length

	const headerActions = (
		<div className="flex items-center gap-2 h-9">
			{selectedCount > 0 && (
				<>
					<HeaderSelectionButton
						icon={<Edit2 size={16} />}
						label="Edit"
						count={selectedCount}
						onClick={() => setIsEditModalOpen(true)}
					/>
					<HeaderSelectionButton
						icon={<Trash2 size={16} />}
						label="Delete"
						count={selectedCount}
						variant="destructive"
						onClick={handleDeleteSelected}
					/>
					<HeaderDivider />
				</>
			)}
			<Button variant="outline" onClick={onNewProject} className="h-9">
				<Plus size={16} className="mr-2" />
				New Project
			</Button>
		</div>
	)

	return (
		<>
			<GenericListView
				columns={columns}
				data={projects}
				onRowClick={onSelectProject}
				enableRowSelection
				includeSelectionColumn
				enableSearch
				searchPlaceholder="Search projects..."
				searchFields={["name", "description"]}
				headerActions={headerActions}
				onSelectionChange={handleSelectionChange}
				getRowId={(row) => row.id.toString()}
				className="p-page"
			/>
			<EditProjectModal
				isOpen={isEditModalOpen}
				onClose={() => {
					setIsEditModalOpen(false)
					clearSelectionFn?.()
				}}
				projects={selectedProjects}
			/>
		</>
	)
}
