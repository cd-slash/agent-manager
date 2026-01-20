import { useMemo, useState } from 'react';
import { Box, Terminal, StopCircle, Play, RefreshCw, Plus, MoreHorizontal, Trash2 } from 'lucide-react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

  const stoppableCount = selectedContainers.filter((c) => c.status === 'running').length;
  const startableCount = selectedContainers.filter((c) => c.status === 'stopped').length;

  const headerActions = (
    <div className="flex items-center gap-2 h-9">
      {stoppableCount > 0 && (
        <Button
          variant="outline"
          onClick={() => {
            // TODO: Implement stop containers
            clearSelectionFn?.();
          }}
          className="h-9 text-destructive hover:text-destructive relative"
        >
          <StopCircle size={16} className="mr-2" />
          Stop
          <span className="ml-1.5 inline-flex items-center justify-center rounded bg-destructive/15 text-destructive text-[11px] font-medium min-w-[1.125rem] h-[1.125rem] px-1 tabular-nums">
            {stoppableCount}
          </span>
        </Button>
      )}
      {startableCount > 0 && (
        <Button
          variant="outline"
          onClick={() => {
            // TODO: Implement start containers
            clearSelectionFn?.();
          }}
          className="h-9 relative"
        >
          <Play size={16} className="mr-2" />
          Start
          <span className="ml-1.5 inline-flex items-center justify-center rounded bg-foreground/10 text-muted-foreground text-[11px] font-medium min-w-[1.125rem] h-[1.125rem] px-1 tabular-nums">
            {startableCount}
          </span>
        </Button>
      )}
      {(stoppableCount > 0 || startableCount > 0) && (
        <div className="h-6 w-px bg-border mx-1" />
      )}
      <Button
        variant="outline"
        size="icon"
        onClick={handleRefreshFromTailscale}
        disabled={isRefreshing}
        title="Refresh from Tailscale"
        className="h-9 w-9"
      >
        <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
      </Button>
      <Button variant="outline" onClick={() => setIsCreateModalOpen(true)} className="h-9">
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
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const container = row.original;
          const isRunning = container.status === 'running';
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem
                    onClick={() => {
                      // TODO: Implement open terminal
                    }}
                  >
                    <Terminal size={16} />
                    Terminal
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      // TODO: Implement stop/start container
                    }}
                  >
                    {isRunning ? (
                      <>
                        <StopCircle size={16} />
                        Stop
                      </>
                    ) : (
                      <>
                        <Play size={16} />
                        Start
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      // TODO: Implement delete container
                    }}
                  >
                    <Trash2 size={16} />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
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
