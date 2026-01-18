import { useMemo } from 'react';
import { Plus, Server, Terminal, FileText } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  GenericListView,
  type FilterConfig,
} from '@/components/layouts/GenericListView';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  TableSelectionActions,
  SelectionActionButton,
} from '@/components/ui/table-actions';
import type { Server as ServerType } from '@/types';

interface ServerViewProps {
  servers: ServerType[];
  onSelectServer: (serverId: string) => void;
}

const statusFilters: FilterConfig[] = [
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'online', label: 'Online' },
      { value: 'maintenance', label: 'Maintenance' },
      { value: 'offline', label: 'Offline' },
    ],
  },
];

export function ServerView({ servers, onSelectServer }: ServerViewProps) {
  const columns: ColumnDef<ServerType>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Server Name',
        cell: ({ row }) => (
          <div className="flex items-center font-medium text-foreground">
            <Server
              size={16}
              className="mr-3 text-muted-foreground group-hover:text-feature-blue transition-colors"
            />
            {row.getValue('name')}
          </div>
        ),
      },
      {
        accessorKey: 'ip',
        header: 'IP Address',
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {row.getValue('ip')}
          </span>
        ),
      },
      {
        accessorKey: 'region',
        header: 'Region',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.getValue('region')}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as
            | 'online'
            | 'maintenance'
            | 'offline';
          return <StatusBadge type="server" status={status} uppercase />;
        },
      },
      {
        id: 'resources',
        header: 'Resource Usage',
        enableSorting: false,
        size: 192,
        cell: ({ row }) => {
          const server = row.original;
          return (
            <div className="space-y-sm">
              <div className="flex items-center text-xs text-muted-foreground">
                <span className="w-8">CPU</span>
                <div className="flex-1 h-1 bg-surface-elevated rounded-full mx-2">
                  <div
                    className="h-1 bg-feature-blue rounded-full"
                    style={{ width: `${server.cpu}%` }}
                  />
                </div>
                <span className="w-6 text-right">{server.cpu}%</span>
              </div>
              <div className="flex items-center text-xs text-muted-foreground">
                <span className="w-8">MEM</span>
                <div className="flex-1 h-1 bg-surface-elevated rounded-full mx-2">
                  <div
                    className="h-1 bg-feature-purple rounded-full"
                    style={{ width: `${server.mem}%` }}
                  />
                </div>
                <span className="w-6 text-right">{server.mem}%</span>
              </div>
            </div>
          );
        },
      },
    ],
    []
  );

  const headerActions = (
    <Button variant="outline">
      <Plus size={16} className="mr-2" />
      Provision Server
    </Button>
  );

  const selectionActions = (
    selectedServers: ServerType[],
    _clearSelection: () => void
  ) => (
    <TableSelectionActions selectedCount={selectedServers.length}>
      <SelectionActionButton
        icon={<Terminal size={16} />}
        label="Terminal"
        onClick={() => {
          // TODO: Implement open terminal
        }}
      />
      <SelectionActionButton
        icon={<FileText size={16} />}
        label="Logs"
        onClick={() => {
          // TODO: Implement view logs
        }}
      />
    </TableSelectionActions>
  );

  return (
    <GenericListView
      columns={columns}
      data={servers}
      onRowClick={(server) => onSelectServer(server.id)}
      enableRowSelection
      includeSelectionColumn
      enableSearch
      searchPlaceholder="Search servers..."
      searchFields={['name', 'ip', 'region']}
      filters={statusFilters}
      headerActions={headerActions}
      selectionActions={selectionActions}
      getRowId={(row) => row.id.toString()}
      className="p-page"
    />
  );
}
