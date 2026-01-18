import { useState, useMemo } from 'react';
import { Search, Link as LinkIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Task } from '@/types';

interface DependencyPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  currentTaskId: string;
  existingDependencies: string[];
  onSelect: (taskId: string) => void;
}

const categories = [
  { value: 'all', label: 'All' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

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

export function DependencyPickerModal({
  open,
  onOpenChange,
  tasks,
  currentTaskId,
  existingDependencies,
  onSelect,
}: DependencyPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Filter out current task and already added dependencies
  const availableTasks = useMemo(() => {
    return tasks.filter(
      (t) => t.id !== currentTaskId && !existingDependencies.includes(t.id)
    );
  }, [tasks, currentTaskId, existingDependencies]);

  // Apply search and category filters
  const filteredTasks = useMemo(() => {
    let filtered = availableTasks;

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((t) => t.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.tag.toLowerCase().includes(query) ||
          t.description?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [availableTasks, selectedCategory, searchQuery]);

  const handleSelect = (taskId: string) => {
    onSelect(taskId);
    onOpenChange(false);
    setSearchQuery('');
    setSelectedCategory('all');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon size={18} />
            Add Dependency
          </DialogTitle>
          <DialogDescription>
            Select a task that must be completed before this task can start.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {categories.map((cat) => (
                <Button
                  key={cat.value}
                  variant={selectedCategory === cat.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.value)}
                  className="text-xs"
                >
                  {cat.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Task Table */}
          <div className="flex-1 min-h-0 overflow-auto border border-border rounded-lg">
            <Table>
              <TableHeader className="bg-surface/90 backdrop-blur sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-1/2">Task</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.map((task) => (
                  <TableRow
                    key={task.id}
                    onClick={() => handleSelect(task.id)}
                    className="cursor-pointer hover:bg-surface-elevated/50"
                  >
                    <TableCell className="font-medium text-foreground">
                      <div className="flex flex-col">
                        <span>{task.title}</span>
                        {task.dependencies?.length > 0 && (
                          <span className="text-[10px] text-warning flex items-center mt-1">
                            <LinkIcon size={10} className="mr-1" />
                            Has {task.dependencies.length} dependencies
                          </span>
                        )}
                      </div>
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
                  </TableRow>
                ))}
                {filteredTasks.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="p-12 text-center text-muted-foreground"
                    >
                      {availableTasks.length === 0
                        ? 'No tasks available to add as dependencies.'
                        : 'No tasks match your search criteria.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Footer info */}
          <div className="text-xs text-muted-foreground">
            {filteredTasks.length} of {availableTasks.length} tasks available
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
