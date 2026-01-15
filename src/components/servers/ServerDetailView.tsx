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
    <div className="h-full overflow-y-auto bg-background p-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface border border-border rounded-xl p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Resource Usage
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between text-sm text-foreground mb-2">
                <span className="flex items-center">
                  <Cpu size={14} className="mr-2" /> CPU
                </span>
                <span>{server.cpu}% <span className="text-muted-foreground">/ 8 Cores</span></span>
              </div>
              <div className="w-full bg-surface-elevated rounded-full h-3">
                <div
                  className="h-full bg-feature-blue rounded-full"
                  style={{ width: `${server.cpu}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm text-foreground mb-2">
                <span className="flex items-center">
                  <HardDrive size={14} className="mr-2" /> Memory
                </span>
                <span>{server.mem}% <span className="text-muted-foreground">/ 16GB</span></span>
              </div>
              <div className="w-full bg-surface-elevated rounded-full h-3">
                <div
                  className="h-full bg-feature-purple rounded-full"
                  style={{ width: `${server.mem}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Server Details
          </h3>
          <div className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Region</div>
              <div className="flex items-center text-sm text-foreground font-mono">
                <Globe size={14} className="mr-2 text-muted-foreground" /> {server.region}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">IP Address</div>
              <div className="flex items-center text-sm text-foreground font-mono">
                <Network size={14} className="mr-2 text-muted-foreground" /> {server.ip}
              </div>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-xl font-bold text-foreground mb-4">Running Containers</h2>
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-background">
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
                <TableCell className="font-medium text-foreground">
                  {c.name}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
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
                <TableCell className="font-mono text-muted-foreground">
                  {c.port}
                </TableCell>
              </TableRow>
            ))}
            {serverContainers.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="p-8 text-center text-muted-foreground"
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
