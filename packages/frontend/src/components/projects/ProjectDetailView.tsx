import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import type { Id } from '@agent-manager/convex/dataModel';
import { useToast } from '@/components/ToastProvider';
import {
  List,
  FileText,
  Info,
  Trash2,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TaskListView } from '@/components/tasks/TaskListView';
import { AgentChatPanel } from '@/components/chat/AgentChatPanel';
import { SpecificationView } from './SpecificationView';
import type { Project, Task, ChatMessage } from '@/types';

// Helper to format timestamps
const formatTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

interface ProjectDetailViewProps {
  project: Project;
  onTaskClick: (task: Task) => void;
  onBack: () => void;
  onUpdateProject: (project: Project) => void;
}

export function ProjectDetailView({
  project,
  onTaskClick,
  onBack,
  onUpdateProject,
}: ProjectDetailViewProps) {
  const [activeTab, setActiveTab] = useState('tasks');
  const [planText, setPlanText] = useState(
    project.plan ||
      `## Project Requirements\n\n${project.description}\n\n## Acceptance Criteria\n\n- [ ] System must be scalable\n- [ ] UI must be responsive`
  );
  const toast = useToast();

  // Get the Convex project ID
  const projectId = project.id as Id<"projects">;

  // Fetch chat messages from Convex
  const chatMessagesData = useQuery(api.chat.listByProject, { projectId }) ?? [];

  // Convert Convex chat messages to legacy format
  const chatHistory: ChatMessage[] = chatMessagesData.map(msg => ({
    id: msg._id,
    sender: msg.sender,
    text: msg.text,
    time: formatTime(msg.createdAt),
  }));

  // Mutation to send messages
  const sendMessage = useMutation(api.chat.sendProjectMessage);

  // Update plan text when project changes
  useEffect(() => {
    setPlanText(project.plan || `## Project Requirements\n\n${project.description}\n\n## Acceptance Criteria\n\n- [ ] System must be scalable\n- [ ] UI must be responsive`);
  }, [project.plan, project.description]);

  const handleChatSend = async (text: string) => {
    try {
      // Send user message to Convex
      await sendMessage({
        projectId,
        text,
        sender: 'user',
      });

      // Simulate AI response (in production this would be handled by a Convex action)
      setTimeout(async () => {
        try {
          await sendMessage({
            projectId,
            text: "I've updated the plan based on your request. I also suggest breaking this down into 3 new tasks.",
            sender: 'ai',
          });
        } catch (error) {
          toast.error('AI response failed', 'Could not process your message');
        }
      }, 1000);
    } catch (error) {
      toast.error('Message failed', error instanceof Error ? error.message : 'Could not send message');
    }
  };

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in duration-300">
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="p-page flex-1 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <TabsList className="w-full justify-start shrink-0 mb-section">
                <TabsTrigger value="tasks" className="flex items-center">
                  <List size={14} className="mr-1.5" />
                  Tasks
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {project.tasks.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="plan" className="flex items-center">
                  <FileText size={14} className="mr-1.5" />
                  Specification
                </TabsTrigger>
                <TabsTrigger value="details" className="flex items-center">
                  <Info size={14} className="mr-1.5" />
                  Details
                </TabsTrigger>
              </TabsList>

              <div className="flex gap-page items-stretch flex-1 min-h-0">
                <div className="flex-1 min-w-0 flex flex-col">
                  <TabsContent value="tasks" className="!mt-0 flex-1 min-h-0">
                    <TaskListView
                      tasks={project.tasks}
                      onTaskClick={onTaskClick}
                    />
                  </TabsContent>

                  <TabsContent value="plan" className="!mt-0">
                    <SpecificationView
                      value={planText}
                      onChange={setPlanText}
                    />
                  </TabsContent>

                  <TabsContent value="details" className="!mt-0">
                    <div className="h-full flex flex-col animate-in fade-in duration-300">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <Info size={16} className="mr-2" />
                        Project Details
                      </h3>
                      <div className="bg-surface border border-border rounded-lg p-section space-y-card">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-item">
                            Project Name
                          </label>
                          <Input value={project.name} readOnly />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-item">
                            Description
                          </label>
                          <Textarea
                            value={project.description}
                            readOnly
                            className="h-24 resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-item">
                            Repository URL
                          </label>
                          <div className="flex">
                            <Input
                              value={`github.com/demo-user/${project.name.toLowerCase().replace(/\s+/g, '-')}`}
                              readOnly
                              className="rounded-r-none text-feature-blue font-mono"
                            />
                            <Button variant="outline" className="rounded-l-none">
                              Copy
                            </Button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-item">
                            Branch
                          </label>
                          <Select defaultValue="main">
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="main">main</SelectItem>
                              <SelectItem value="develop">develop</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end pt-card">
                          <Button variant="destructive">
                            <Trash2 size={16} className="mr-2" /> Archive Project
                          </Button>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </div>

                <div className="w-1/3 shrink-0">
                  <AgentChatPanel
                    chatHistory={chatHistory}
                    onSendMessage={handleChatSend}
                  />
                </div>
              </div>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
