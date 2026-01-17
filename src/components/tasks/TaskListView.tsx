import { useMemo } from 'react';
import { Edit2, GitPullRequest, Link as LinkIcon } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
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
    <DataTable
      columns={columns}
      data={tasks}
      onRowClick={onTaskClick}
      enablePagination
      fillHeight
      pageSize={10}
      emptyMessage="No tasks found. Add one to get started!"
      getRowId={(row) => row.id.toString()}
    />
  );
}
