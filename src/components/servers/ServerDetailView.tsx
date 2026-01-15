import { Globe, Network, Cpu, HardDrive } from 'lucide-react';
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
}

export function ServerDetailView({
  server,
  containers,
}: ServerDetailViewProps) {
  const serverContainers = containers.filter((c) => c.server === server.name);

  return (
    <div className="h-full overflow-y-auto bg-slate-950 p-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Resource Usage
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between text-sm text-slate-300 mb-2">
                <span className="flex items-center">
                  <Cpu size={14} className="mr-2" /> CPU
                </span>
                <span>{server.cpu}% <span className="text-slate-500">/ 8 Cores</span></span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${server.cpu}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm text-slate-300 mb-2">
                <span className="flex items-center">
                  <HardDrive size={14} className="mr-2" /> Memory
                </span>
                <span>{server.mem}% <span className="text-slate-500">/ 16GB</span></span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3">
                <div
                  className="h-full bg-purple-500 rounded-full"
                  style={{ width: `${server.mem}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Server Details
          </h3>
          <div className="space-y-4">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Region</div>
              <div className="flex items-center text-sm text-slate-200 font-mono">
                <Globe size={14} className="mr-2 text-slate-400" /> {server.region}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">IP Address</div>
              <div className="flex items-center text-sm text-slate-200 font-mono">
                <Network size={14} className="mr-2 text-slate-400" /> {server.ip}
              </div>
            </div>
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
