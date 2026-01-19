import { useState } from 'react';
import { Key, Cpu, Network, Sliders, Lock, Bell, RefreshCw, Check, Copy } from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function SettingsView() {
  const [activeTab, setActiveTab] = useState('credentials');
  const toast = useToast();

  // Tailscale state
  const [tailnetId, setTailnetId] = useState('');
  const [tailscaleApiKey, setTailscaleApiKey] = useState('');
  const [tailscaleWebhookSecret, setTailscaleWebhookSecret] = useState('');
  const [isSavingTailscale, setIsSavingTailscale] = useState(false);
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);

  // Derive webhook URL from Convex URL
  const convexUrl = (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_CONVEX_URL)
    || "https://brazen-skunk-217.convex.cloud";
  const webhookUrl = convexUrl.replace('.convex.cloud', '.convex.site') + '/webhooks/tailscale';

  const handleCopyWebhookUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setWebhookUrlCopied(true);
    toast.success('Copied', 'Webhook URL copied to clipboard');
    setTimeout(() => setWebhookUrlCopied(false), 2000);
  };

  // Convex hooks for Tailscale
  const tailscaleConfig = useQuery(api.settings.getTailscaleConfig);
  const upsertSetting = useMutation(api.settings.upsert);
  const syncDevices = useAction(api.tailscale.syncDevices);

  const handleSaveTailscale = async () => {
    setIsSavingTailscale(true);

    try {
      // Save credentials
      await upsertSetting({
        key: 'tailscale',
        value: {
          tailnetId: tailnetId || tailscaleConfig?.tailnetId || '',
          apiKey: tailscaleApiKey || undefined, // Only update if provided
          webhookSecret: tailscaleWebhookSecret || undefined, // Only update if provided
        },
      });

      // Trigger initial sync
      await syncDevices();

      toast.success('Tailscale configured', 'Configuration saved and devices synced successfully');
      setTailscaleApiKey(''); // Clear the API key field for security
      setTailscaleWebhookSecret(''); // Clear the webhook secret field for security
    } catch (error) {
      toast.error('Configuration failed', error instanceof Error ? error.message : 'Failed to save Tailscale configuration');
    } finally {
      setIsSavingTailscale(false);
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full bg-background">
      <div className="px-page pt-section shrink-0">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="credentials" className="flex items-center">
            <Key size={14} className="mr-1.5" />
            Credentials
          </TabsTrigger>
          <TabsTrigger value="models" className="flex items-center">
            <Cpu size={14} className="mr-1.5" />
            Model Config
          </TabsTrigger>
          <TabsTrigger value="network" className="flex items-center">
            <Network size={14} className="mr-1.5" />
            Network
          </TabsTrigger>
          <TabsTrigger value="general" className="flex items-center">
            <Sliders size={14} className="mr-1.5" />
            General
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="flex-1 overflow-y-auto px-page py-section animate-in fade-in duration-300">
        <TabsContent value="credentials" className="mt-0">
          <div className="w-full space-y-6">
            <div className="bg-surface border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                API Keys
              </h3>
              <div className="space-y-4 max-w-3xl">
                <div className="space-y-2">
                  <Label>OpenAI API Key</Label>
                  <div className="relative">
                    <Input type="password" placeholder="sk-..." />
                    <Lock
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Anthropic API Key</Label>
                  <div className="relative">
                    <Input type="password" placeholder="sk-ant-..." />
                    <Lock
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Gemini API Key</Label>
                  <div className="relative">
                    <Input type="password" placeholder="AIza..." />
                    <Lock
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="pt-2">
                  <Button>Save Keys</Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="models" className="mt-0">
          <div className="w-full space-y-6">
            <div className="bg-surface border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Model Defaults
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
                <div className="space-y-2">
                  <Label>Primary Chat Model</Label>
                  <Select defaultValue="gemini">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Gemini 1.5 Pro</SelectItem>
                      <SelectItem value="gpt4">GPT-4 Turbo</SelectItem>
                      <SelectItem value="claude">Claude 3 Opus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Coding Model</Label>
                  <Select defaultValue="sonnet">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sonnet">
                        Claude 3.5 Sonnet
                      </SelectItem>
                      <SelectItem value="gpt4">GPT-4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Temperature</Label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    className="w-full h-2 bg-background rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Context Window</Label>
                  <Select defaultValue="128k">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="128k">128k Tokens</SelectItem>
                      <SelectItem value="32k">32k Tokens</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="network" className="mt-0">
          <div className="w-full space-y-6">
            <div className="bg-surface border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Tailscale Integration
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Connect to your Tailscale network to automatically discover servers and agents.
                Devices tagged <code className="bg-background px-1 rounded">tag:code-agent-host</code> will appear as servers,
                and <code className="bg-background px-1 rounded">tag:code-agent</code> will appear as containers.
              </p>
              <div className="space-y-4 max-w-3xl">
                <div className="space-y-2">
                  <Label>Tailnet ID</Label>
                  <Input
                    type="text"
                    placeholder="your-tailnet.ts.net or organization name"
                    value={tailnetId || tailscaleConfig?.tailnetId || ''}
                    onChange={(e) => setTailnetId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your tailnet name or organization name from the Tailscale admin console
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <div className="relative">
                    <Input
                      type="password"
                      placeholder={tailscaleConfig?.hasApiKey ? '••••••••••••••••' : 'tskey-api-...'}
                      value={tailscaleApiKey}
                      onChange={(e) => setTailscaleApiKey(e.target.value)}
                    />
                    <Lock
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tailscaleConfig?.hasApiKey
                      ? 'API key is configured. Enter a new key to update it.'
                      : 'Create an API key in the Tailscale admin console with read access to devices'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Webhook Secret</Label>
                  <div className="relative">
                    <Input
                      type="password"
                      placeholder={tailscaleConfig?.hasWebhookSecret ? '••••••••••••••••' : 'tskey-webhook-...'}
                      value={tailscaleWebhookSecret}
                      onChange={(e) => setTailscaleWebhookSecret(e.target.value)}
                    />
                    <Lock
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tailscaleConfig?.hasWebhookSecret
                      ? 'Webhook secret is configured. Enter a new secret to update it.'
                      : 'Create a webhook in the Tailscale admin console and copy the secret here'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={webhookUrl}
                      readOnly
                      className="font-mono text-xs bg-background"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyWebhookUrl}
                      className="shrink-0"
                    >
                      {webhookUrlCopied ? (
                        <Check size={14} className="text-success" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Paste this URL in the Tailscale admin console when creating your webhook
                  </p>
                </div>
                {tailscaleConfig?.lastValidated && (
                  <div className="text-xs text-muted-foreground">
                    Last synced: {new Date(tailscaleConfig.lastValidated).toLocaleString()}
                  </div>
                )}
                <div className="pt-2">
                  <Button
                    onClick={handleSaveTailscale}
                    disabled={isSavingTailscale || (!tailnetId && !tailscaleConfig?.tailnetId)}
                  >
                    {isSavingTailscale ? (
                      <>
                        <RefreshCw size={14} className="mr-2 animate-spin" />
                        Saving & Syncing...
                      </>
                    ) : (
                      'Save & Sync'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="general" className="mt-0">
          <div className="w-full space-y-6">
            <div className="bg-surface border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Preferences
              </h3>
              <div className="space-y-4 max-w-3xl">
                <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
                  <div className="flex items-center">
                    <Bell size={18} className="text-muted-foreground mr-3" />
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Notifications
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Receive alerts for task updates
                      </div>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Select defaultValue="dark">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">Dark (Default)</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );
}
