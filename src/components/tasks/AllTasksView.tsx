import { useState, useMemo } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  Edit2,
  GitPullRequest,
  Link as LinkIcon,
  Search,
  Trash2,
} from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, createSelectionColumn } from '@/components/ui/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Project, Task } from '@/types';

interface AllTasksViewProps {
  projects: Project[];
  onTaskClick: (task: Task, projectId: number) => void;
}

type TaskWithProject = Task & {
  projectId: number;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [selectedTasks, setSelectedTasks] = useState<TaskWithProject[]>([]);
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

  const handleSelectionChange = (rows: TaskWithProject[], clear: () => void) => {
    setSelectedTasks(rows);
    setClearSelection(() => clear);
  };

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

  const filteredTasks = useMemo(() => {
    return allTasks.filter((task) => {
      const matchesSearch = task.title
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === 'all' || task.category === statusFilter;
      const matchesTag = tagFilter === 'all' || task.tag === tagFilter;
      const matchesProject =
        projectFilter === 'all' || task.projectId.toString() === projectFilter;
      return matchesSearch && matchesStatus && matchesTag && matchesProject;
    });
  }, [allTasks, searchQuery, statusFilter, tagFilter, projectFilter]);

  const columns: ColumnDef<TaskWithProject>[] = useMemo(
    () => [
      createSelectionColumn<TaskWithProject>(),
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
    <div className="h-full flex flex-col p-page">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
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

        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id.toString()}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="backlog">Backlog</SelectItem>
            <SelectItem value="todo">To Do</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {uniqueTags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedTasks.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDeleteSelected}
          >
            <Trash2 size={16} className="mr-2" />
            Delete ({selectedTasks.length})
          </Button>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredTasks}
        onRowClick={(task) => onTaskClick(task, task.projectId)}
        enableRowSelection
        enablePagination
        fillHeight
        pageSize={10}
        emptyMessage={
          allTasks.length === 0
            ? 'No tasks found. Create a project to get started!'
            : 'No tasks match your filters.'
        }
        getRowId={(row) => `${row.projectId}-${row.id}`}
        onSelectionChange={handleSelectionChange}
      />
    </div>
  );
}
