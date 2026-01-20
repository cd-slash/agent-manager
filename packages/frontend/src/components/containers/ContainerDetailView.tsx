import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import { Box, Server, Terminal, Hammer, Network, Clock, Info } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/ui/status-badge';
import { BuildTimeline, type BuildPhase } from './BuildTimeline';
import { BuildLogViewer } from './BuildLogViewer';
import type { Container } from '@/types';

interface ContainerDetailViewProps {
  container: Container;
}

export function ContainerDetailView({
  container,
}: ContainerDetailViewProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedPhase, setSelectedPhase] = useState<string | undefined>();

  // Fetch build status from Convex
  const build = useQuery(api.containerBuilds.getByContainer, {
    containerId: container.containerId,
  });
  const phasesData = useQuery(api.containerBuilds.getPhases, {
    containerId: container.containerId,
  });

  // Convert phases to the expected format
  const phases: BuildPhase[] = (phasesData ?? []).map((p) => ({
    phase: p.phase,
    status: p.status as BuildPhase['status'],
    startedAt: p.startedAt,
    completedAt: p.completedAt,
    error: p.error,
    logs: p.logs,
    order: p.order,
  }));

  // Auto-select first phase with logs or the current phase
  const effectiveSelectedPhase =
    selectedPhase ||
    build?.currentPhase ||
    phases.find((p) => p.logs || p.error)?.phase ||
    phases[0]?.phase;

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in duration-300">
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="px-page pt-section shrink-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full justify-start">
                <TabsTrigger value="overview" className="flex items-center">
                  <Info size={14} className="mr-1.5" />
                  Overview
                </TabsTrigger>
                {build && phases.length > 0 && (
                  <TabsTrigger value="build" className="flex items-center">
                    <Hammer size={14} className="mr-1.5" />
                    Build
                  </TabsTrigger>
                )}
                <TabsTrigger value="logs" className="flex items-center">
                  <Terminal size={14} className="mr-1.5" />
                  Logs
                </TabsTrigger>
              </TabsList>

              <div className="py-6">
                <TabsContent value="overview" className="!mt-0">
                  <div className="space-y-8">
                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <Box size={16} className="mr-2" /> Container Info
                      </h3>
                      <div className="bg-surface border border-border rounded-lg p-4">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <label className="text-xs text-muted-foreground uppercase font-semibold">
                              Image
                            </label>
                            <div className="text-foreground font-mono mt-1">
                              {container.image}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground uppercase font-semibold">
                              Server
                            </label>
                            <div className="text-foreground font-mono mt-1 flex items-center">
                              <Server size={14} className="mr-1.5 text-muted-foreground" />
                              {container.server}
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <Network size={16} className="mr-2" /> Networking
                      </h3>
                      <div className="bg-surface border border-border rounded-lg p-4">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <label className="text-xs text-muted-foreground uppercase font-semibold">
                              Proxied Ports
                            </label>
                            <div className="text-foreground font-mono text-lg mt-1">
                              {container.port}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground uppercase font-semibold">
                              Tailscale IP
                            </label>
                            <div className="text-foreground font-mono text-lg mt-1">100.x.y.z</div>
                          </div>
                          <div className="col-span-2">
                            <label className="text-xs text-muted-foreground uppercase font-semibold">
                              FQDN (Tailscale)
                            </label>
                            <div className="text-feature-blue font-mono text-lg mt-1">
                              {container.name}.tail-scale.ts.net
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <Clock size={16} className="mr-2" /> Running Application
                      </h3>
                      <div className="bg-surface border border-border rounded-lg p-4">
                        <div className="space-y-4">
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
                            <div className="text-foreground mt-1">14 days, 3 hours</div>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </TabsContent>

                {build && phases.length > 0 && (
                  <TabsContent value="build" className="!mt-0">
                    <div className="space-y-8">
                      <section>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center justify-between">
                          <span className="flex items-center">
                            <Hammer size={16} className="mr-2" /> Build Status
                          </span>
                          <StatusBadge
                            type="build"
                            status={build.status as 'pending' | 'in_progress' | 'completed' | 'failed'}
                            uppercase
                            className="px-3 py-1"
                          />
                        </h3>
                        <div className="bg-surface border border-border rounded-lg p-4">
                          <div className="flex items-center gap-3 mb-4">
                            <div>
                              <span className="text-sm font-medium text-foreground">
                                Current Phase: {build.currentPhase}
                              </span>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {build.repo} @ {build.branch}
                              </div>
                            </div>
                          </div>

                          {build.error && (
                            <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-3 mb-4">
                              <p className="text-sm text-red-300 font-medium">Build Failed</p>
                              <p className="text-xs text-red-200/70 mt-1">{build.error}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-6">
                            <div className="bg-surface/50 rounded-lg p-4 border border-border">
                              <h4 className="text-xs text-muted-foreground uppercase font-semibold mb-3">
                                Build Timeline
                              </h4>
                              <BuildTimeline
                                phases={phases}
                                currentPhase={build.currentPhase}
                                selectedPhase={effectiveSelectedPhase}
                                onSelectPhase={setSelectedPhase}
                              />
                            </div>

                            <div className="h-80">
                              <BuildLogViewer
                                logs={
                                  phases.find((p) => p.phase === effectiveSelectedPhase)?.logs
                                }
                                error={
                                  phases.find((p) => p.phase === effectiveSelectedPhase)?.error
                                }
                                phase={effectiveSelectedPhase || 'pending'}
                              />
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  </TabsContent>
                )}

                <TabsContent value="logs" className="!mt-0">
                  <div className="space-y-8">
                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <Terminal size={16} className="mr-2" /> Application Logs
                      </h3>
                      <div className="bg-surface border border-border rounded-lg overflow-hidden flex flex-col h-96">
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
                    </section>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
