import { useMemo } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import type { Id } from '@agent-manager/convex/dataModel';
import { Edit2, GitPullRequest, Link as LinkIcon, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  GenericListView,
  type FilterConfig,
} from '@/components/layouts/GenericListView';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  TableSelectionActions,
  SelectionActionButton,
} from '@/components/ui/table-actions';
import type { Task } from '@/types';

interface TaskListViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function TaskListView({ tasks, onTaskClick }: TaskListViewProps) {
  const deleteTask = useMutation(api.tasks.deleteTask);

  const uniqueTags = useMemo(
    () => [...new Set(tasks.map((t) => t.tag))],
    [tasks]
  );

  const filters: FilterConfig[] = useMemo(
    () => [
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
    [uniqueTags]
  );

  const columns: ColumnDef<Task>[] = useMemo(
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
        accessorKey: 'category',
        header: 'Status',
        cell: ({ row }) => {
          const category = row.getValue('category') as 'backlog' | 'todo' | 'in-progress' | 'done';
          return (
            <StatusBadge
              type="task"
              status={category}
              uppercase
              className="text-[10px] font-bold"
            />
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
    selectedTasks: Task[],
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
    selectedTasks: Task[],
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
      data={tasks}
      onRowClick={onTaskClick}
      enableRowSelection
      includeSelectionColumn
      enableSearch
      searchPlaceholder="Search tasks..."
      searchFields={['title']}
      filters={filters}
      selectionActions={selectionActions}
      emptyMessage="No tasks found. Add one to get started!"
      getRowId={(row) => row.id.toString()}
    />
  );
}
