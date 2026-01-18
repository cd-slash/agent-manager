import { useMemo } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import type { Id } from '@agent-manager/convex/dataModel';
import {
  Edit2,
  GitPullRequest,
  Link as LinkIcon,
  Trash2,
} from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  GenericListView,
  type FilterConfig,
} from '@/components/layouts/GenericListView';
import { Badge } from '@/components/ui/badge';
import {
  TableSelectionActions,
  SelectionActionButton,
} from '@/components/ui/table-actions';
import type { Project, Task } from '@/types';

interface AllTasksViewProps {
  projects: Project[];
  onTaskClick: (task: Task, projectId: string) => void;
}

type TaskWithProject = Task & {
  projectId: string;
  projectName: string;
};

const getStatusVariant = (status: string) => {
  switch (status) {
    case 'done':
      return 'success';
    case 'in-progress':
      return 'info';
    case 'todo':
      return 'warning';
    default:
      return 'secondary';
  }
};

export function AllTasksView({ projects, onTaskClick }: AllTasksViewProps) {
  const deleteTask = useMutation(api.tasks.deleteTask);

  const allTasks = useMemo(
    () =>
      projects.flatMap((project) =>
        project.tasks.map((task) => ({
          ...task,
          projectId: project.id,
          projectName: project.name,
        }))
      ),
    [projects]
  );

  const uniqueTags = useMemo(
    () => [...new Set(allTasks.map((t) => t.tag))],
    [allTasks]
  );

  const filters: FilterConfig[] = useMemo(
    () => [
      {
        key: 'projectId',
        label: 'Project',
        options: projects.map((p) => ({
          value: p.id.toString(),
          label: p.name,
        })),
      },
      {
        key: 'category',
        label: 'Status',
        options: [
          { value: 'backlog', label: 'Backlog' },
          { value: 'todo', label: 'To Do' },
          { value: 'in-progress', label: 'In Progress' },
          { value: 'done', label: 'Done' },
        ],
      },
      {
        key: 'tag',
        label: 'Tag',
        options: uniqueTags.map((tag) => ({
          value: tag,
          label: tag,
        })),
      },
    ],
    [projects, uniqueTags]
  );

  const columns: ColumnDef<TaskWithProject>[] = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: 'Task',
        size: 400,
        cell: ({ row }) => {
          const task = row.original;
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
                  {task.prNumber || '4829'}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'projectName',
        header: 'Project',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.getValue('projectName')}
          </span>
        ),
      },
      {
        accessorKey: 'category',
        header: 'Status',
        cell: ({ row }) => {
          const category = row.getValue('category') as string;
          return (
            <Badge
              variant={getStatusVariant(category)}
              className="text-[10px] uppercase font-bold"
            >
              {category}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'tag',
        header: 'Tag',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs">
            {row.getValue('tag')}
          </Badge>
        ),
      },
    ],
    []
  );

  const handleDeleteSelected = async (
    selectedTasks: TaskWithProject[],
    clearSelection: () => void
  ) => {
    await Promise.all(
      selectedTasks.map((task) =>
        deleteTask({ id: task.id as unknown as Id<'tasks'> })
      )
    );
    clearSelection();
  };

  const selectionActions = (
    selectedTasks: TaskWithProject[],
    clearSelection: () => void
  ) => (
    <TableSelectionActions selectedCount={selectedTasks.length}>
      <SelectionActionButton
        icon={<Edit2 size={16} />}
        label="Edit"
        onClick={() => {
          // TODO: Implement bulk edit
        }}
      />
      <SelectionActionButton
        icon={<Trash2 size={16} />}
        label="Delete"
        variant="destructive"
        onClick={() => handleDeleteSelected(selectedTasks, clearSelection)}
      />
    </TableSelectionActions>
  );

  return (
    <GenericListView
      columns={columns}
      data={allTasks}
      onRowClick={(task) => onTaskClick(task, task.projectId)}
      enableRowSelection
      includeSelectionColumn
      enableSearch
      searchPlaceholder="Search tasks..."
      searchFields={['title']}
      filters={filters}
      selectionActions={selectionActions}
      emptyMessage={
        allTasks.length === 0
          ? 'No tasks found. Create a project to get started!'
          : 'No tasks match your filters.'
      }
      getRowId={(row) => `${row.projectId}-${row.id}`}
    />
  );
}
