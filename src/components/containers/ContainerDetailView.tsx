import { ChevronLeft, Box, Server, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Container } from '@/types';

interface ContainerDetailViewProps {
  container: Container;
  onBack: () => void;
}

export function ContainerDetailView({
  container,
  onBack,
}: ContainerDetailViewProps) {
  return (
    <div className="h-full overflow-y-auto bg-slate-950 p-8">
      <Button
        variant="ghost"
        onClick={onBack}
        className="mb-6 text-slate-400 hover:text-white"
      >
        <ChevronLeft size={20} className="mr-1" /> Back to Containers
      </Button>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {container.name}
          </h1>
          <div className="flex items-center space-x-4 text-sm text-slate-400 font-mono">
            <span className="flex items-center">
              <Box size={14} className="mr-1.5" /> {container.image}
            </span>
            <span className="flex items-center">
              <Server size={14} className="mr-1.5" /> {container.server}
            </span>
          </div>
        </div>
        <Badge
          variant={container.status === 'running' ? 'success' : 'destructive'}
          className="px-4 py-1.5 text-sm uppercase"
        >
          {container.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-slate-800 pb-2">
            Networking
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 uppercase font-semibold">
                Proxied Ports
              </label>
              <div className="text-slate-300 font-mono text-lg">
                {container.port}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase font-semibold">
                Tailscale IP
              </label>
              <div className="text-slate-300 font-mono text-lg">100.x.y.z</div>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-500 uppercase font-semibold">
                FQDN (Tailscale)
              </label>
              <div className="text-blue-400 font-mono text-lg">
                {container.name}.tail-scale.ts.net
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-slate-800 pb-2">
            Running Application
          </h3>
          <div>
            <label className="text-xs text-slate-500 uppercase font-semibold">
              Command
            </label>
            <div className="bg-slate-950 p-2 rounded text-slate-400 font-mono text-sm mt-1">
              docker-entrypoint.sh npm start
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase font-semibold">
              Uptime
            </label>
            <div className="text-slate-300">14 days, 3 hours</div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-96">
        <div className="bg-slate-950 p-3 border-b border-slate-800 flex justify-between items-center">
          <div className="text-slate-400 text-sm font-mono flex items-center">
            <Terminal size={14} className="mr-2" /> /var/log/app.log
          </div>
          <Button variant="ghost" size="sm" className="text-slate-500">
            Download Logs
          </Button>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="font-mono text-sm text-slate-300 space-y-1">
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
    </div>
  );
}
