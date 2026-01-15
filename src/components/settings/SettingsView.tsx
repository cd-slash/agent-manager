import { useState } from 'react';
import { Key, Cpu, Network, Sliders, Lock, Bell } from 'lucide-react';
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

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="px-6 pt-6 shrink-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
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

          <div className="flex-1 overflow-y-auto py-6 animate-in fade-in duration-300">
            <TabsContent value="credentials" className="mt-0">
              <div className="w-full space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    API Keys
                  </h3>
                  <div className="space-y-4 max-w-3xl">
                    <div className="space-y-2">
                      <Label>OpenAI API Key</Label>
                      <div className="relative">
                        <Input type="password" placeholder="sk-..." />
                        <Lock
                          size={14}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Anthropic API Key</Label>
                      <div className="relative">
                        <Input type="password" placeholder="sk-ant-..." />
                        <Lock
                          size={14}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Gemini API Key</Label>
                      <div className="relative">
                        <Input type="password" placeholder="AIza..." />
                        <Lock
                          size={14}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
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
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">
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
                        className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
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
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Network Configuration
                  </h3>
                  <div className="space-y-4 max-w-3xl">
                    <div className="flex items-center justify-between p-4 bg-slate-950 rounded-lg border border-slate-800">
                      <div>
                        <div className="text-sm font-medium text-white">
                          Enable VPC Peering
                        </div>
                        <div className="text-xs text-slate-500">
                          Allow direct connection to private resources
                        </div>
                      </div>
                      <Switch />
                    </div>
                    <div className="space-y-2">
                      <Label>Proxy Server</Label>
                      <Input placeholder="http://proxy.example.com:8080" />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="general" className="mt-0">
              <div className="w-full space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Preferences
                  </h3>
                  <div className="space-y-4 max-w-3xl">
                    <div className="flex items-center justify-between p-4 bg-slate-950 rounded-lg border border-slate-800">
                      <div className="flex items-center">
                        <Bell size={18} className="text-slate-400 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-white">
                            Notifications
                          </div>
                          <div className="text-xs text-slate-500">
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
      </div>
    </div>
  );
}
