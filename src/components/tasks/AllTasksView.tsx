import { useState, useMemo } from 'react';
import {
  Edit2,
  GitPullRequest,
  Link as LinkIcon,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

const ITEMS_PER_PAGE = 10;

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
  const [currentPage, setCurrentPage] = useState(1);

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

  const totalPages = Math.ceil(filteredTasks.length / ITEMS_PER_PAGE);
  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleFilterChange = () => {
    setCurrentPage(1);
  };

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
            onChange={(e) => {
              setSearchQuery(e.target.value);
              handleFilterChange();
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={projectFilter}
          onValueChange={(value) => {
            setProjectFilter(value);
            handleFilterChange();
          }}
        >
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

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value);
            handleFilterChange();
          }}
        >
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

        <Select
          value={tagFilter}
          onValueChange={(value) => {
            setTagFilter(value);
            handleFilterChange();
          }}
        >
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

        <div className="ml-auto text-sm text-muted-foreground">
          {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface/50 rounded-xl border border-border overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-surface/90 backdrop-blur sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[40%]">Task</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tag</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedTasks.map((task) => (
                <TableRow
                  key={`${task.projectId}-${task.id}`}
                  onClick={() => onTaskClick(task, task.projectId)}
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
                    <span className="text-sm text-muted-foreground">
                      {task.projectName}
                    </span>
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
              {paginatedTasks.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="p-12 text-center text-muted-foreground"
                  >
                    {allTasks.length === 0
                      ? 'No tasks found. Create a project to get started!'
                      : 'No tasks match your filters.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface/50">
            <div className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredTasks.length)} of{' '}
              {filteredTasks.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={16} className="mr-1" />
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => (
                    <Button
                      key={page}
                      variant={currentPage === page ? 'default' : 'ghost'}
                      size="icon-sm"
                      onClick={() => setCurrentPage(page)}
                      className="w-8 h-8"
                    >
                      {page}
                    </Button>
                  )
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight size={16} className="ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
