import { Plus, Server, Terminal, FileText } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, createSelectionColumn } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Server as ServerType } from '@/types';

interface ServerViewProps {
  servers: ServerType[];
  onSelectServer: (serverId: string) => void;
}

const columns: ColumnDef<ServerType>[] = [
  createSelectionColumn<ServerType>(),
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
      const status = row.getValue('status') as string;
      return (
        <Badge
          variant={status === 'online' ? 'success' : 'warning'}
          className="uppercase"
        >
          {status}
        </Badge>
      );
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
  {
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    cell: () => (
      <div className="flex justify-end space-x-item">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => e.stopPropagation()}
          title="Terminal"
        >
          <Terminal size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => e.stopPropagation()}
          title="Logs"
        >
          <FileText size={16} />
        </Button>
      </div>
    ),
  },
];

export function ServerView({ servers, onSelectServer }: ServerViewProps) {
  return (
    <div className="p-page h-full flex flex-col bg-background">
      <div className="flex justify-end mb-section">
        <Button variant="outline">
          <Plus size={16} className="mr-2" />
          Provision Server
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={servers}
        onRowClick={(server) => onSelectServer(server.id)}
        enableRowSelection
        enablePagination
        fillHeight
        getRowId={(row) => row.id.toString()}
      />
    </div>
  );
}
