import { useState } from 'react';
import {
  Search,
  Filter,
  Box,
  FileText,
  Terminal,
  StopCircle,
  Play,
  ChevronRight,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

export function ContainerView({
  containers,
  onSelectContainer,
}: ContainerViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredContainers = containers.filter((container) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      container.name.toLowerCase().includes(term) ||
      container.image.toLowerCase().includes(term) ||
      container.server.toLowerCase().includes(term);
    const matchesStatus =
      statusFilter === 'all' || container.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950">
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
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
              <Filter size={16} className="mr-2 text-slate-500" />
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

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-950">
            <TableRow>
              <TableHead>Container Name</TableHead>
              <TableHead>Image</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Host Server</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredContainers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="p-8 text-center text-slate-500"
                >
                  No containers found matching your filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredContainers.map((container) => (
                <TableRow
                  key={container.id}
                  onClick={() => onSelectContainer(container.id)}
                  className="cursor-pointer group"
                >
                  <TableCell>
                    <div className="font-medium text-slate-200 flex items-center">
                      <Box size={14} className="mr-2 text-slate-500" />
                      {container.name}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5 ml-6">
                      ID: {container.id}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-400 font-mono text-xs">
                    {container.image}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <div
                        className={`w-2 h-2 rounded-full mr-2 ${
                          container.status === 'running'
                            ? 'bg-green-500 animate-pulse'
                            : 'bg-red-500'
                        }`}
                      ></div>
                      <span
                        className={`capitalize ${
                          container.status === 'running'
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        {container.status}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-400">
                    {container.server}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => e.stopPropagation()}
                        title="Logs"
                        className="text-slate-400 hover:text-blue-400"
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
                          className="text-slate-400 hover:text-red-400"
                        >
                          <StopCircle size={16} />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => e.stopPropagation()}
                          title="Start"
                          className="text-slate-400 hover:text-green-400"
                        >
                          <Play size={16} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
