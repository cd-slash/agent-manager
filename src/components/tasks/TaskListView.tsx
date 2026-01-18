import { useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Edit2, GitPullRequest, Link as LinkIcon, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, createSelectionColumn } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Task } from '@/types';

interface TaskListViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

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

export function TaskListView({ tasks, onTaskClick }: TaskListViewProps) {
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [clearSelection, setClearSelection] = useState<(() => void) | null>(null);

  const deleteTask = useMutation(api.tasks.deleteTask);

  const handleDeleteSelected = async () => {
    await Promise.all(
      selectedTasks.map((task) =>
        deleteTask({ id: task.id as unknown as Id<'tasks'> })
      )
    );
    clearSelection?.();
  };

  const handleSelectionChange = (rows: Task[], clear: () => void) => {
    setSelectedTasks(rows);
    setClearSelection(() => clear);
  };

  const columns: ColumnDef<Task>[] = useMemo(
    () => [
      createSelectionColumn<Task>(),
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
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: () => (
          <div className="text-right">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-feature-blue hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <Edit2 size={16} />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="h-full flex flex-col">
      {selectedTasks.length > 0 && (
        <div className="flex items-center justify-end mb-3">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDeleteSelected}
          >
            <Trash2 size={16} className="mr-2" />
            Delete ({selectedTasks.length})
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={tasks}
        onRowClick={onTaskClick}
        enableRowSelection
        enablePagination
        fillHeight
        pageSize={10}
        emptyMessage="No tasks found. Add one to get started!"
        getRowId={(row) => row.id.toString()}
        onSelectionChange={handleSelectionChange}
      />
    </div>
  );
}
