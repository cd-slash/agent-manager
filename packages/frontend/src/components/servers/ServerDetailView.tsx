import { useState } from 'react';
import { Globe, Network, Cpu, HardDrive, User, Save, Loader2 } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import type { Server, Container, ServerId } from '@/types';

interface ServerDetailViewProps {
  server: Server & { _id?: ServerId };
  containers: Container[];
}

export function ServerDetailView({
  server,
  containers,
}: ServerDetailViewProps) {
  const [sshUser, setSshUser] = useState(server.sshUser || 'root');
  const [isSaving, setIsSaving] = useState(false);
  const updateServer = useMutation(api.servers.update);

  const serverContainers = containers.filter((c) => c.server === server.name);

  const handleSaveSshUser = async () => {
    if (!server._id) return;
    setIsSaving(true);
    try {
      await updateServer({ id: server._id, sshUser });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = sshUser !== (server.sshUser || 'root');

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
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold">
            <User size={14} />
            <span>SSH User</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={sshUser}
              onChange={(e) => setSshUser(e.target.value)}
              placeholder="root"
              className="font-mono text-sm h-8"
            />
            {server._id && (
              <Button
                size="sm"
                variant={hasChanges ? "default" : "outline"}
                onClick={handleSaveSshUser}
                disabled={isSaving || !hasChanges}
                className="h-8 px-3"
              >
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Username for SSH connections when creating containers
          </p>
        </div>
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
