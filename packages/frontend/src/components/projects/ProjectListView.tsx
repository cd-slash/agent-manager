import { useMemo } from 'react';
import { Plus, Layout, List, Clock, Edit2, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { GenericListView } from '@/components/layouts/GenericListView';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  TableSelectionActions,
  SelectionActionButton,
} from '@/components/ui/table-actions';
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
    ],
    []
  );

  const headerActions = (
    <Button variant="outline" onClick={onNewProject}>
      <Plus size={16} className="mr-2" />
      New Project
    </Button>
  );

  const selectionActions = (
    selectedProjects: Project[],
    clearSelection: () => void
  ) => (
    <TableSelectionActions selectedCount={selectedProjects.length}>
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
        onClick={() => {
          // TODO: Implement bulk delete
          clearSelection();
        }}
      />
    </TableSelectionActions>
  );

  return (
    <GenericListView
      columns={columns}
      data={projects}
      onRowClick={onSelectProject}
      enableRowSelection
      includeSelectionColumn
      enableSearch
      searchPlaceholder="Search projects..."
      searchFields={['name', 'description']}
      headerActions={headerActions}
      selectionActions={selectionActions}
      getRowId={(row) => row.id.toString()}
      className="p-page"
    />
  );
}
