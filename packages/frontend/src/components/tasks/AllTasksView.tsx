import { api } from "@agent-manager/convex/api"
import type { Id } from "@agent-manager/convex/dataModel"
import type { ColumnDef } from "@tanstack/react-table"
import { useMutation } from "convex/react"
import {
	Edit2,
	GitPullRequest,
	Link as LinkIcon,
	MoreHorizontal,
	Plus,
	Trash2,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import {
	type FilterConfig,
	GenericListView,
} from "@/components/layouts/GenericListView"
import { useToast } from "@/components/ToastProvider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Project, Task } from "@/types"

interface AllTasksViewProps {
	projects: Project[]
	onTaskClick: (task: Task, projectId: string) => void
	onNewTask?: () => void
}

type TaskWithProject = Task & {
	projectId: string
	projectName: string
}

const getStatusVariant = (status: string) => {
	switch (status) {
		case "done":
			return "success"
		case "in-progress":
			return "info"
		case "todo":
			return "warning"
		default:
			return "secondary"
	}
}

export function AllTasksView({
	projects,
	onTaskClick,
	onNewTask,
}: AllTasksViewProps) {
	const deleteTask = useMutation(api.tasks.deleteTask)
	const toast = useToast()
	const [selectedTasks, setSelectedTasks] = useState<TaskWithProject[]>([])
	const [clearSelectionFn, setClearSelectionFn] = useState<(() => void) | null>(
		null,
	)
	const [deletingTasks, setDeletingTasks] = useState<Set<string>>(new Set())

	const handleDeleteTask = useCallback(
		async (task: TaskWithProject) => {
			const taskKey = `${task.projectId}-${task.id}`
			setDeletingTasks((prev) => new Set(prev).add(taskKey))
			try {
				await deleteTask({ id: task.id as unknown as Id<"tasks"> })
				toast.success("Task deleted", `"${task.title}" has been deleted`)
			} catch (error) {
				toast.error(
					"Delete failed",
					error instanceof Error ? error.message : "Failed to delete task",
				)
			} finally {
				setDeletingTasks((prev) => {
					const next = new Set(prev)
					next.delete(taskKey)
					return next
				})
			}
		},
		[deleteTask, toast],
	)

	const handleDeleteSelected = async () => {
		try {
			await Promise.all(
				selectedTasks.map((task) =>
					deleteTask({ id: task.id as unknown as Id<"tasks"> }),
				),
			)
			toast.success(
				"Tasks deleted",
				`${selectedTasks.length} task${selectedTasks.length > 1 ? "s" : ""} deleted`,
			)
			clearSelectionFn?.()
		} catch (error) {
			toast.error(
				"Delete failed",
				error instanceof Error ? error.message : "Failed to delete tasks",
			)
		}
	}

	const handleSelectionChange = (
		rows: TaskWithProject[],
		clearSelection: () => void,
	) => {
		setSelectedTasks(rows)
		setClearSelectionFn(() => clearSelection)
	}

	const allTasks = useMemo(
		() =>
			projects.flatMap((project) =>
				project.tasks.map((task) => ({
					...task,
					projectId: project.id,
					projectName: project.name,
				})),
			),
		[projects],
	)

	const uniqueTags = useMemo(
		() => [...new Set(allTasks.map((t) => t.tag))],
		[allTasks],
	)

	const filters: FilterConfig[] = useMemo(
		() => [
			{
				key: "projectId",
				label: "Project",
				options: projects.map((p) => ({
					value: p.id.toString(),
					label: p.name,
				})),
			},
			{
				key: "category",
				label: "Status",
				options: [
					{ value: "backlog", label: "Backlog" },
					{ value: "todo", label: "To Do" },
					{ value: "in-progress", label: "In Progress" },
					{ value: "done", label: "Done" },
				],
			},
			{
				key: "tag",
				label: "Tag",
				options: uniqueTags.map((tag) => ({
					value: tag,
					label: tag,
				})),
			},
		],
		[projects, uniqueTags],
	)

	const columns: ColumnDef<TaskWithProject>[] = useMemo(
		() => [
			{
				accessorKey: "title",
				header: "Task",
				size: 400,
				cell: ({ row }) => {
					const task = row.original
					return (
						<div className="font-medium text-foreground">
							<div className="flex flex-col">
								<span>{task.title}</span>
								{task.dependencies && task.dependencies.length > 0 && (
									<span className="text-[10px] text-warning flex items-center mt-1">
										<LinkIcon size={10} className="mr-1" />
										Waiting on {task.dependencies.length} tasks
									</span>
								)}
							</div>
							{task.prCreated && (
								<Badge variant="purple" className="ml-2 text-[10px]">
									<GitPullRequest size={10} className="mr-1" /> PR #
									{task.prNumber || "4829"}
								</Badge>
							)}
						</div>
					)
				},
			},
			{
				accessorKey: "projectName",
				header: "Project",
				cell: ({ row }) => (
					<span className="text-sm text-muted-foreground">
						{row.getValue("projectName")}
					</span>
				),
			},
			{
				accessorKey: "category",
				header: "Status",
				cell: ({ row }) => {
					const category = row.getValue("category") as string
					return (
						<Badge
							variant={getStatusVariant(category)}
							className="text-[10px] uppercase font-bold"
						>
							{category}
						</Badge>
					)
				},
			},
			{
				accessorKey: "tag",
				header: "Tag",
				cell: ({ row }) => (
					<Badge variant="outline" className="text-xs">
						{row.getValue("tag")}
					</Badge>
				),
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => {
					const task = row.original
					const taskKey = `${task.projectId}-${task.id}`
					return (
						<div className="flex justify-end">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={(e) => e.stopPropagation()}
									>
										<MoreHorizontal size={16} />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="end"
									onClick={(e) => e.stopPropagation()}
								>
									<DropdownMenuItem
										onClick={() => {
											// TODO: Implement edit
										}}
									>
										<Edit2 size={16} />
										Edit
									</DropdownMenuItem>
									<DropdownMenuItem
										className="text-destructive focus:text-destructive"
										onClick={() => handleDeleteTask(task)}
										disabled={deletingTasks.has(taskKey)}
									>
										<Trash2 size={16} />
										{deletingTasks.has(taskKey) ? "Deleting..." : "Delete"}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)
				},
			},
		],
		[deletingTasks, handleDeleteTask],
	)

	const selectedCount = selectedTasks.length

	const headerActions = (
		<div className="flex items-center gap-2 h-9">
			{selectedCount > 0 && (
				<>
					<Button
						variant="outline"
						onClick={handleDeleteSelected}
						className="h-9 text-destructive hover:text-destructive"
					>
						<Trash2 size={16} className="mr-2" />
						Delete
						<span className="ml-1.5 inline-flex items-center justify-center rounded bg-destructive/15 text-destructive text-[11px] font-medium min-w-[1.125rem] h-[1.125rem] px-1 tabular-nums">
							{selectedCount}
						</span>
					</Button>
					<div className="h-6 w-px bg-border mx-1" />
				</>
			)}
			{onNewTask && (
				<Button variant="outline" onClick={onNewTask} className="h-9">
					<Plus size={16} className="mr-2" />
					New
				</Button>
			)}
		</div>
	)

	return (
		<GenericListView
			columns={columns}
			data={allTasks}
			onRowClick={(task) => onTaskClick(task, task.projectId)}
			enableRowSelection
			includeSelectionColumn
			enableSearch
			searchPlaceholder="Search tasks..."
			searchFields={["title"]}
			filters={filters}
			headerActions={headerActions}
			onSelectionChange={handleSelectionChange}
			emptyMessage={
				allTasks.length === 0
					? "No tasks found. Create a project to get started!"
					: "No tasks match your filters."
			}
			getRowId={(row) => `${row.projectId}-${row.id}`}
			className="p-page"
		/>
	)
}
