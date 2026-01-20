import { useState } from 'react';
import { Globe, Network, Cpu, HardDrive, User, Save, Loader2, Server, Info, Box } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import type { Server as ServerType, Container, ServerId } from '@/types';

interface ServerDetailViewProps {
  server: ServerType & { _id?: ServerId };
  containers: Container[];
}

export function ServerDetailView({
  server,
  containers,
}: ServerDetailViewProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [sshUser, setSshUser] = useState(server.sshUser || 'ubuntu');
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

  const hasChanges = sshUser !== (server.sshUser || 'ubuntu');

  // Parse CPU and Memory values for progress bars
  const cpuPercent = parseInt(server.cpu) || 0;
  const memPercent = parseInt(server.mem) || 0;

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
                <TabsTrigger value="containers" className="flex items-center">
                  <Box size={14} className="mr-1.5" />
                  Containers
                </TabsTrigger>
              </TabsList>

              <div className="py-6">
                <TabsContent value="overview" className="!mt-0">
                  <div className="space-y-8">
                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <Cpu size={16} className="mr-2" /> Resource Usage
                      </h3>
                      <div className="bg-surface border border-border rounded-lg p-4">
                        <div className="space-y-6">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 text-sm">
                                <Cpu size={14} className="text-muted-foreground" />
                                <span className="text-foreground font-medium">CPU</span>
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {server.cpu} / 8 Cores
                              </span>
                            </div>
                            <div className="h-2 bg-background rounded-full overflow-hidden">
                              <div
                                className="h-full bg-feature-blue rounded-full transition-all"
                                style={{ width: `${Math.min(cpuPercent * 12.5, 100)}%` }}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 text-sm">
                                <HardDrive size={14} className="text-muted-foreground" />
                                <span className="text-foreground font-medium">Memory</span>
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {server.mem} / 16GB
                              </span>
                            </div>
                            <div className="h-2 bg-background rounded-full overflow-hidden">
                              <div
                                className="h-full bg-feature-purple rounded-full transition-all"
                                style={{ width: `${Math.min(memPercent * 6.25, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <Server size={16} className="mr-2" /> Server Details
                      </h3>
                      <div className="bg-surface border border-border rounded-lg p-4">
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold mb-1">
                                <Globe size={14} />
                                <span>Region</span>
                              </div>
                              <div className="text-foreground font-mono">{server.region}</div>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold mb-1">
                                <Network size={14} />
                                <span>IP Address</span>
                              </div>
                              <div className="text-foreground font-mono">{server.ip}</div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-border">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold mb-2">
                              <User size={14} />
                              <span>SSH User</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                value={sshUser}
                                onChange={(e) => setSshUser(e.target.value)}
                                placeholder="ubuntu"
                                className="font-mono text-sm h-8 max-w-xs"
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
                            <p className="text-xs text-muted-foreground mt-2">
                              Username for SSH connections when creating containers
                            </p>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </TabsContent>

                <TabsContent value="containers" className="!mt-0">
                  <div className="space-y-8">
                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <Box size={16} className="mr-2" /> Running Containers
                      </h3>
                      <div className="bg-surface border border-border rounded-lg overflow-hidden">
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
