import { useMemo } from 'react';
import { Plus, Layout, List, Clock, MoreHorizontal } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, createSelectionColumn } from '@/components/ui/data-table';
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
  const columns: ColumnDef<Project>[] = useMemo(
    () => [
      createSelectionColumn<Project>(),
      {
        accessorKey: 'name',
        header: 'Project Name',
        size: 250,
        cell: ({ row }) => (
          <div className="flex items-center font-medium text-foreground whitespace-nowrap max-w-[200px]">
            <Layout size={16} className="mr-3 text-feature-blue shrink-0" />
            <span className="truncate">{row.getValue('name')}</span>
          </div>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Description',
        size: 300,
        cell: ({ row }) => (
          <span className="text-muted-foreground max-w-xs truncate block">
            {row.getValue('description')}
          </span>
        ),
      },
      {
        id: 'progress',
        header: 'Progress',
        size: 192,
        cell: ({ row }) => {
          const project = row.original;
          const done = project.tasks.filter((t) => t.category === 'done').length;
          const total = project.tasks.length;
          const progress = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div className="flex items-center space-x-3">
              <Progress value={progress} className="flex-1" />
              <span className="text-xs text-muted-foreground font-medium w-8 text-right">
                {progress}%
              </span>
            </div>
          );
        },
      },
      {
        id: 'tasks',
        header: 'Tasks',
        cell: ({ row }) => {
          const total = row.original.tasks.length;
          return (
            <div className="flex items-center text-muted-foreground">
              <List size={14} className="mr-1.5 text-muted-foreground" />
              {total}
            </div>
          );
        },
      },
      {
        id: 'updated',
        header: 'Updated',
        cell: () => (
          <div className="flex items-center text-muted-foreground text-xs">
            <Clock size={14} className="mr-1.5 text-muted-foreground" />
            2h ago
          </div>
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
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal size={16} />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="p-page h-full flex flex-col bg-background">
      <div className="flex justify-end mb-section">
        <Button onClick={onNewProject}>
          <Plus size={16} className="mr-2" />
          New Project
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={projects}
        onRowClick={onSelectProject}
        enableRowSelection
        enablePagination
        fillHeight
        getRowId={(row) => row.id.toString()}
      />
    </div>
  );
}
