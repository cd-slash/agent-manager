import { Globe, Network, Cpu, HardDrive } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DetailViewLayout,
  InfoCard,
  InfoItem,
  ResourceBar,
} from '@/components/layouts/DetailViewLayout';
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

  const infoCards = (
    <>
      <InfoCard title="Resource Usage" wide className="space-y-6">
        <ResourceBar
          label="CPU"
          value={server.cpu}
          max="8 Cores"
          color="blue"
          icon={<Cpu size={14} />}
        />
        <ResourceBar
          label="Memory"
          value={server.mem}
          max="16GB"
          color="purple"
          icon={<HardDrive size={14} />}
        />
      </InfoCard>

      <InfoCard title="Server Details" className="space-y-4">
        <InfoItem
          label="Region"
          value={server.region}
          icon={<Globe size={14} />}
          mono
        />
        <InfoItem
          label="IP Address"
          value={server.ip}
          icon={<Network size={14} />}
          mono
        />
      </InfoCard>
    </>
  );

  return (
    <DetailViewLayout infoCards={infoCards} gridColumns={3}>
      <h2 className="text-xl font-bold text-foreground mb-4">
        Running Containers
      </h2>
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
                  <StatusBadge
                    type="container"
                    status={
                      c.status as
                        | 'running'
                        | 'stopped'
                        | 'restarting'
                        | 'paused'
                        | 'exited'
                    }
                    capitalize
                  />
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
    </DetailViewLayout>
  );
}
