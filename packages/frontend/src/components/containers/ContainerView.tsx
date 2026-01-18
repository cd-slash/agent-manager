import { useMemo } from 'react';
import { Box, FileText, Terminal, StopCircle, Play } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  GenericListView,
  type FilterConfig,
} from '@/components/layouts/GenericListView';
import { Button } from '@/components/ui/button';
import type { Container } from '@/types';

interface ContainerViewProps {
  containers: Container[];
  onSelectContainer: (containerId: string) => void;
}

const statusFilters: FilterConfig[] = [
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'running', label: 'Running' },
      { value: 'stopped', label: 'Stopped' },
    ],
  },
];

export function ContainerView({
  containers,
  onSelectContainer,
}: ContainerViewProps) {
  const columns: ColumnDef<Container>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Container Name',
        cell: ({ row }) => {
          const container = row.original;
          return (
            <div>
              <div className="font-medium text-foreground flex items-center">
                <Box size={14} className="mr-2 text-muted-foreground" />
                {container.name}
              </div>
              <div className="text-xs text-muted-foreground font-mono mt-0.5 ml-6">
                ID: {container.id}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'image',
        header: 'Image',
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {row.getValue('image')}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as string;
          return (
            <div className="flex items-center">
              <div
                className={`w-2 h-2 rounded-full mr-2 ${
                  status === 'running'
                    ? 'bg-success animate-pulse'
                    : 'bg-destructive'
                }`}
              />
              <span
                className={`capitalize ${
                  status === 'running' ? 'text-success' : 'text-destructive'
                }`}
              >
                {status}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'server',
        header: 'Host Server',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.getValue('server')}</span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const container = row.original;
          return (
            <div className="flex items-center justify-end space-x-item">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => e.stopPropagation()}
                title="Logs"
                className="text-muted-foreground hover:text-feature-blue"
              >
                <FileText size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => e.stopPropagation()}
                title="Terminal"
              >
                <Terminal size={16} />
              </Button>
              {container.status === 'running' ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => e.stopPropagation()}
                  title="Stop"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <StopCircle size={16} />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => e.stopPropagation()}
                  title="Start"
                  className="text-muted-foreground hover:text-success"
                >
                  <Play size={16} />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <GenericListView
      columns={columns}
      data={containers}
      onRowClick={(container) => onSelectContainer(container.id)}
      enableRowSelection
      includeSelectionColumn
      enableSearch
      searchPlaceholder="Search containers..."
      searchFields={['name', 'image', 'server']}
      filters={statusFilters}
      emptyMessage="No containers found matching your filters."
      getRowId={(row) => row.id}
    />
  );
}
