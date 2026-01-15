import { Edit2, GitPullRequest, Link as LinkIcon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  return (
    <div className="bg-surface/50 rounded-xl border border-border overflow-hidden w-full h-full flex flex-col">
      <div className="overflow-auto flex-1">
        <Table>
          <TableHeader className="bg-surface/90 backdrop-blur sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-1/2">Task</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="cursor-pointer group"
              >
                <TableCell className="font-medium text-foreground">
                  <div className="flex flex-col">
                    <span>{task.title}</span>
                    {task.dependencies?.length > 0 && (
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
                </TableCell>
                <TableCell>
                  <Badge
                    variant={getStatusVariant(task.category)}
                    className="text-[10px] uppercase font-bold"
                  >
                    {task.category}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {task.tag}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-feature-blue hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Edit2 size={16} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {tasks.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="p-12 text-center text-muted-foreground"
                >
                  No tasks found. Add one to get started!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
