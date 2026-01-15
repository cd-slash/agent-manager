import { Plus, Layout, List, Clock, MoreHorizontal } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { Project } from '@/types';

interface ProjectListViewProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onNewProject: () => void;
}

export function ProjectListView({
  projects,
  onSelectProject,
  onNewProject,
}: ProjectListViewProps) {
  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950">
      <div className="flex justify-end mb-6">
        <Button onClick={onNewProject}>
          <Plus size={16} className="mr-2" />
          New Project
        </Button>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-950">
            <TableRow>
              <TableHead className="w-1/4">Project Name</TableHead>
              <TableHead className="w-1/3">Description</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Tasks</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => {
              const done = project.tasks.filter(
                (t) => t.category === 'done'
              ).length;
              const total = project.tasks.length;
              const progress =
                total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <TableRow
                  key={project.id}
                  onClick={() => onSelectProject(project)}
                  className="cursor-pointer group"
                >
                  <TableCell className="font-medium text-slate-200 whitespace-nowrap max-w-[200px]">
                    <div className="flex items-center">
                      <Layout
                        size={16}
                        className="mr-3 text-blue-500 shrink-0"
                      />
                      <span className="truncate">{project.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-400 max-w-xs truncate">
                    {project.description}
                  </TableCell>
                  <TableCell className="w-48">
                    <div className="flex items-center space-x-3">
                      <Progress value={progress} className="flex-1" />
                      <span className="text-xs text-slate-500 font-medium w-8 text-right">
                        {progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-400">
                    <div className="flex items-center">
                      <List size={14} className="mr-1.5 text-slate-600" />
                      {total}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-500 text-xs">
                    <div className="flex items-center">
                      <Clock size={14} className="mr-1.5 text-slate-600" />
                      2h ago
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
