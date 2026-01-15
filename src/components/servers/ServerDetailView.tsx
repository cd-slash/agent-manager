import { ChevronLeft, Globe, Network, Cpu, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Server, Container } from '@/types';

interface ServerDetailViewProps {
  server: Server;
  containers: Container[];
  onBack: () => void;
}

export function ServerDetailView({
  server,
  containers,
  onBack,
}: ServerDetailViewProps) {
  const serverContainers = containers.filter((c) => c.server === server.name);

  return (
    <div className="h-full overflow-y-auto bg-slate-950 p-8">
      <Button
        variant="ghost"
        onClick={onBack}
        className="mb-6 text-slate-400 hover:text-white"
      >
        <ChevronLeft size={20} className="mr-1" /> Back to Servers
      </Button>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{server.name}</h1>
          <div className="flex items-center space-x-4 text-sm text-slate-400 font-mono">
            <span className="flex items-center">
              <Globe size={14} className="mr-1.5" /> {server.region}
            </span>
            <span className="flex items-center">
              <Network size={14} className="mr-1.5" /> {server.ip}
            </span>
          </div>
        </div>
        <Badge
          variant={server.status === 'online' ? 'success' : 'warning'}
          className="px-4 py-1.5 text-sm uppercase"
        >
          {server.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center">
            <Cpu size={16} className="mr-2" /> CPU Utilization
          </h3>
          <div className="flex items-end space-x-1 h-32">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="flex-1 bg-blue-500/20 rounded-t-sm relative group"
              >
                <div
                  className="absolute bottom-0 w-full bg-blue-500 rounded-t-sm transition-all duration-500"
                  style={{ height: `${30 + Math.random() * 40}%` }}
                ></div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4 text-sm text-slate-300">
            <span>Usage: {server.cpu}%</span>
            <span className="text-slate-500">8 Cores</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center">
            <HardDrive size={16} className="mr-2" /> Memory Usage
          </h3>
          <div className="flex items-center justify-center h-32">
            <div className="w-full bg-slate-800 rounded-full h-4 relative">
              <div
                className="absolute top-0 left-0 h-full bg-purple-500 rounded-full"
                style={{ width: `${server.mem}%` }}
              ></div>
            </div>
          </div>
          <div className="flex justify-between mt-4 text-sm text-slate-300">
            <span>{server.mem}% Used</span>
            <span className="text-slate-500">16GB Total</span>
          </div>
        </div>
      </div>

      <h2 className="text-xl font-bold text-white mb-4">Running Containers</h2>
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-950">
            <TableRow>
              <TableHead>Container Name</TableHead>
              <TableHead>Image</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ports</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {serverContainers.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-slate-200">
                  {c.name}
                </TableCell>
                <TableCell className="font-mono text-slate-400">
                  {c.image}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={c.status === 'running' ? 'success' : 'destructive'}
                    className="capitalize"
                  >
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-slate-400">
                  {c.port}
                </TableCell>
              </TableRow>
            ))}
            {serverContainers.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="p-8 text-center text-slate-500"
                >
                  No containers running on this server.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
