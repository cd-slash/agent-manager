import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Box,
  FileText,
  Terminal,
  StopCircle,
  Play,
} from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, createSelectionColumn } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Container } from '@/types';

interface ContainerViewProps {
  containers: Container[];
  onSelectContainer: (containerId: string) => void;
}

const columns: ColumnDef<Container>[] = [
  createSelectionColumn<Container>(),
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
              status === 'running' ? 'bg-success animate-pulse' : 'bg-destructive'
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
];

export function ContainerView({
  containers,
  onSelectContainer,
}: ContainerViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredContainers = useMemo(() => {
    return containers.filter((container) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        container.name.toLowerCase().includes(term) ||
        container.image.toLowerCase().includes(term) ||
        container.server.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === 'all' || container.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [containers, searchTerm, statusFilter]);

  return (
    <div className="p-page h-full flex flex-col bg-background">
      <div className="flex flex-col sm:flex-row gap-card mb-section">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={16}
          />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search containers..."
            className="pl-10"
          />
        </div>
        <div className="relative w-full sm:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <Filter size={16} className="mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="stopped">Stopped</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredContainers}
        onRowClick={(container) => onSelectContainer(container.id)}
        enableRowSelection
        enablePagination
        fillHeight
        emptyMessage="No containers found matching your filters."
        getRowId={(row) => row.id}
      />
    </div>
  );
}
