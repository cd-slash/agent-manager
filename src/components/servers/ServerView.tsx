import { Plus, Server, Terminal, FileText } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Server as ServerType } from '@/types';

interface ServerViewProps {
  servers: ServerType[];
  onSelectServer: (serverId: number) => void;
}

export function ServerView({ servers, onSelectServer }: ServerViewProps) {
  return (
    <div className="p-8 h-full overflow-y-auto bg-background">
      <div className="flex justify-end mb-6">
        <Button variant="outline">
          <Plus size={16} className="mr-2" />
          Provision Server
        </Button>
      </div>
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-background">
            <TableRow>
              <TableHead>Server Name</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Resource Usage</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.map((server) => (
              <TableRow
                key={server.id}
                onClick={() => onSelectServer(server.id)}
                className="cursor-pointer group"
              >
                <TableCell className="font-medium text-foreground">
                  <div className="flex items-center">
                    <Server
                      size={16}
                      className="mr-3 text-muted-foreground group-hover:text-feature-blue transition-colors"
                    />
                    {server.name}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {server.ip}
                </TableCell>
                <TableCell className="text-muted-foreground">{server.region}</TableCell>
                <TableCell>
                  <Badge
                    variant={server.status === 'online' ? 'success' : 'warning'}
                    className="uppercase"
                  >
                    {server.status}
                  </Badge>
                </TableCell>
                <TableCell className="w-48">
                  <div className="space-y-1.5">
                    <div className="flex items-center text-xs text-muted-foreground">
                      <span className="w-8">CPU</span>
                      <div className="flex-1 h-1 bg-surface-elevated rounded-full mx-2">
                        <div
                          className="h-1 bg-feature-blue rounded-full"
                          style={{ width: `${server.cpu}%` }}
                        ></div>
                      </div>
                      <span className="w-6 text-right">{server.cpu}%</span>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <span className="w-8">MEM</span>
                      <div className="flex-1 h-1 bg-surface-elevated rounded-full mx-2">
                        <div
                          className="h-1 bg-feature-purple rounded-full"
                          style={{ width: `${server.mem}%` }}
                        ></div>
                      </div>
                      <span className="w-6 text-right">{server.mem}%</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-2">
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
