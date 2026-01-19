import { useMemo, useState } from 'react';
import { Box, FileText, Terminal, StopCircle, Play, RefreshCw } from 'lucide-react';
import { useAction } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/button';
import type { ColumnDef } from '@tanstack/react-table';
import {
  GenericListView,
  type FilterConfig,
} from '@/components/layouts/GenericListView';
import {
  TableSelectionActions,
  SelectionActionButton,
} from '@/components/ui/table-actions';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const syncDevices = useAction(api.tailscale.syncDevices);
  const toast = useToast();

  const handleRefreshFromTailscale = async () => {
    setIsRefreshing(true);
    try {
      await syncDevices();
      toast.success('Sync complete', 'Containers refreshed from Tailscale');
    } catch (error) {
      toast.error('Sync failed', error instanceof Error ? error.message : 'Failed to sync from Tailscale');
    } finally {
      setIsRefreshing(false);
    }
  };

  const headerActions = (
    <Button
      variant="outline"
      onClick={handleRefreshFromTailscale}
      disabled={isRefreshing}
    >
      <RefreshCw size={16} className={`mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
      {isRefreshing ? 'Syncing...' : 'Refresh from Tailscale'}
    </Button>
  );

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
    ],
    []
  );

  const selectionActions = (
    selectedContainers: Container[],
    clearSelection: () => void
  ) => {
    const canStop = selectedContainers.some((c) => c.status === 'running');
    const canStart = selectedContainers.some((c) => c.status === 'stopped');

    return (
      <TableSelectionActions selectedCount={selectedContainers.length}>
        <SelectionActionButton
          icon={<FileText size={16} />}
          label="Logs"
          onClick={() => {
            // TODO: Implement view logs
          }}
        />
        <SelectionActionButton
          icon={<Terminal size={16} />}
          label="Terminal"
          onClick={() => {
            // TODO: Implement open terminal
          }}
        />
        {canStop && (
          <SelectionActionButton
            icon={<StopCircle size={16} />}
            label="Stop"
            variant="destructive"
            onClick={() => {
              // TODO: Implement stop containers
              clearSelection();
            }}
          />
        )}
        {canStart && (
          <SelectionActionButton
            icon={<Play size={16} />}
            label="Start"
            onClick={() => {
              // TODO: Implement start containers
              clearSelection();
            }}
          />
        )}
      </TableSelectionActions>
    );
  };

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
      headerActions={headerActions}
      selectionActions={selectionActions}
      emptyMessage="No containers found matching your filters."
      getRowId={(row) => row.id}
      className="p-page"
    />
  );
}
