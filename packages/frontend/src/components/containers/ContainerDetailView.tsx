import { Box, Server, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DetailViewLayout,
  InfoCard,
} from '@/components/layouts/DetailViewLayout';
import type { Container } from '@/types';

interface ContainerDetailViewProps {
  container: Container;
  onBack: () => void;
}

export function ContainerDetailView({
  container,
  onBack,
}: ContainerDetailViewProps) {
  const subtitle = (
    <>
      <span className="flex items-center font-mono">
        <Box size={14} className="mr-1.5" /> {container.image}
      </span>
      <span className="flex items-center font-mono">
        <Server size={14} className="mr-1.5" /> {container.server}
      </span>
    </>
  );

  const headerActions = (
    <StatusBadge
      type="container"
      status={
        container.status as
          | 'running'
          | 'stopped'
          | 'restarting'
          | 'paused'
          | 'exited'
      }
      uppercase
      className="px-4 py-1.5 text-sm"
    />
  );

  const infoCards = (
    <>
      <InfoCard title="Networking" className="space-y-4">
        <div className="border-b border-border pb-2 -mt-2" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground uppercase font-semibold">
              Proxied Ports
            </label>
            <div className="text-foreground font-mono text-lg">
              {container.port}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase font-semibold">
              Tailscale IP
            </label>
            <div className="text-foreground font-mono text-lg">100.x.y.z</div>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground uppercase font-semibold">
              FQDN (Tailscale)
            </label>
            <div className="text-feature-blue font-mono text-lg">
              {container.name}.tail-scale.ts.net
            </div>
          </div>
        </div>
      </InfoCard>

      <InfoCard title="Running Application" className="space-y-4">
        <div className="border-b border-border pb-2 -mt-2" />
        <div>
          <label className="text-xs text-muted-foreground uppercase font-semibold">
            Command
          </label>
          <div className="bg-background p-2 rounded text-muted-foreground font-mono text-sm mt-1">
            docker-entrypoint.sh npm start
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground uppercase font-semibold">
            Uptime
          </label>
          <div className="text-foreground">14 days, 3 hours</div>
        </div>
      </InfoCard>
    </>
  );

  return (
    <DetailViewLayout
      onBack={onBack}
      backText="Back to Containers"
      title={container.name}
      subtitle={subtitle}
      headerActions={headerActions}
      infoCards={infoCards}
      gridColumns={2}
    >
      <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col h-96">
        <div className="bg-background p-3 border-b border-border flex justify-between items-center">
          <div className="text-muted-foreground text-sm font-mono flex items-center">
            <Terminal size={14} className="mr-2" /> /var/log/app.log
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            Download Logs
          </Button>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="font-mono text-sm text-foreground space-y-1">
            <div className="opacity-50">
              [2023-10-25 10:00:01] INFO: Starting application server...
            </div>
            <div className="opacity-50">
              [2023-10-25 10:00:02] INFO: Connected to database pool
            </div>
            <div className="opacity-50">
              [2023-10-25 10:00:02] INFO: Listening on port 8080
            </div>
            <div>
              [2023-10-25 14:20:15] WARN: Response time threshold exceeded
              (502ms)
            </div>
            <div>[2023-10-25 14:22:10] INFO: GET /api/v1/users 200 OK</div>
          </div>
        </ScrollArea>
      </div>
    </DetailViewLayout>
  );
}
