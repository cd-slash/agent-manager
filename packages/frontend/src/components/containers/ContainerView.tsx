import { useMemo, useState } from 'react';
import { Box, Terminal, StopCircle, Play, RefreshCw, Plus } from 'lucide-react';
import { useAction } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ColumnDef } from '@tanstack/react-table';
import {
  GenericListView,
  type FilterConfig,
} from '@/components/layouts/GenericListView';
import { CreateContainerModal } from '@/components/modals/CreateContainerModal';
import { agentGateway } from '@/lib/agent-gateway';
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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedContainers, setSelectedContainers] = useState<Container[]>([]);
  const [clearSelectionFn, setClearSelectionFn] = useState<(() => void) | null>(null);
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

  const handleCreateContainer = async (data: {
    repo: string;
    branch: string;
    name?: string;
    server: string;
  }) => {
    const result = await agentGateway.createContainer({
      repo: data.repo,
      branch: data.branch,
      name: data.name,
      server: data.server,
    });

    toast.success(
      'Container created',
      `Container "${result.name}" created on ${result.server}`
    );

    // Sync to get the new container in the list
    await syncDevices();
  };

  const canStop = selectedContainers.some((c) => c.status === 'running');
  const canStart = selectedContainers.some((c) => c.status === 'stopped');

  const headerActions = (
    <div className="flex items-center gap-2">
      {selectedContainers.length > 0 && (
        <>
          <Badge variant="secondary" className="font-normal">
            {selectedContainers.length} selected
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // TODO: Implement open terminal
            }}
          >
            <Terminal size={16} className="mr-2" />
            Terminal
          </Button>
          {canStop && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // TODO: Implement stop containers
                clearSelectionFn?.();
              }}
              className="text-destructive hover:text-destructive"
            >
              <StopCircle size={16} className="mr-2" />
              Stop
            </Button>
          )}
          {canStart && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // TODO: Implement start containers
                clearSelectionFn?.();
              }}
            >
              <Play size={16} className="mr-2" />
              Start
            </Button>
          )}
          <div className="h-6 w-px bg-border mx-1" />
        </>
      )}
      <Button
        variant="outline"
        size="icon"
        onClick={handleRefreshFromTailscale}
        disabled={isRefreshing}
        title="Refresh from Tailscale"
      >
        <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
      </Button>
      <Button onClick={() => setIsCreateModalOpen(true)}>
        <Plus size={16} className="mr-2" />
        New
      </Button>
    </div>
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

  const handleSelectionChange = (rows: Container[], clearSelection: () => void) => {
    setSelectedContainers(rows);
    setClearSelectionFn(() => clearSelection);
  };

  return (
    <>
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
        onSelectionChange={handleSelectionChange}
        emptyMessage="No containers found matching your filters."
        getRowId={(row) => row.id}
        className="p-page"
      />
      <CreateContainerModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateContainer}
      />
    </>
  );
}
