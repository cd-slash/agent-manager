import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import type { Id } from '@agent-manager/convex/dataModel';
import {
  List,
  FileText,
  Info,
  Plus,
  Grid,
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
import { KanbanColumn } from '@/components/tasks/KanbanColumn';
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
  onAddTask: (projectId: string, title: string) => void;
}

export function ProjectDetailView({
  project,
  onTaskClick,
  onBack,
  onUpdateProject,
  onAddTask,
}: ProjectDetailViewProps) {
  const [activeTab, setActiveTab] = useState('tasks');
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'board'>('list');
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [planText, setPlanText] = useState(
    project.plan ||
      `## Project Requirements\n\n${project.description}\n\n## Acceptance Criteria\n\n- [ ] System must be scalable\n- [ ] UI must be responsive`
  );

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

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskTitle.trim()) return;
    onAddTask(project.id, quickTaskTitle);
    setQuickTaskTitle('');
  };

  const handleChatSend = async (text: string) => {
    // Send user message to Convex
    await sendMessage({
      projectId,
      text,
      sender: 'user',
    });

    // Simulate AI response (in production this would be handled by a Convex action)
    setTimeout(async () => {
      await sendMessage({
        projectId,
        text: "I've updated the plan based on your request. I also suggest breaking this down into 3 new tasks.",
        sender: 'ai',
      });
    }, 1000);
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
                  <TabsContent value="tasks" className="!mt-0 flex-1 min-h-0 flex flex-col">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <List size={16} className="mr-2" />
                        Tasks
                      </h3>
                      <div className="flex justify-between items-center mb-section">
                        <form
                          onSubmit={handleQuickAdd}
                          className="flex-1 max-w-lg relative mr-4"
                        >
                          <Plus
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          />
                          <Input
                            value={quickTaskTitle}
                            onChange={(e) => setQuickTaskTitle(e.target.value)}
                            placeholder="Add a new task..."
                            className="pl-10"
                          />
                        </form>
                        <div className="flex items-center space-x-2 bg-surface border border-border rounded-lg p-compact">
                          <Button
                            variant={taskViewMode === 'list' ? 'secondary' : 'ghost'}
                            size="icon-sm"
                            onClick={() => setTaskViewMode('list')}
                          >
                            <List size={18} />
                          </Button>
                          <Button
                            variant={taskViewMode === 'board' ? 'secondary' : 'ghost'}
                            size="icon-sm"
                            onClick={() => setTaskViewMode('board')}
                          >
                            <Grid size={18} />
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 min-h-0">
                        {taskViewMode === 'list' ? (
                          <TaskListView
                            tasks={project.tasks}
                            onTaskClick={onTaskClick}
                          />
                        ) : (
                          <div className="flex h-full space-x-section min-w-max overflow-x-auto pb-item">
                            <KanbanColumn
                              title="Backlog"
                              tasks={project.tasks.filter(
                                (t) => t.category === 'backlog'
                              )}
                              onTaskClick={onTaskClick}
                            />
                            <KanbanColumn
                              title="To Do"
                              tasks={project.tasks.filter(
                                (t) => t.category === 'todo'
                              )}
                              onTaskClick={onTaskClick}
                            />
                            <KanbanColumn
                              title="In Progress"
                              tasks={project.tasks.filter(
                                (t) => t.category === 'in-progress'
                              )}
                              onTaskClick={onTaskClick}
                            />
                            <KanbanColumn
                              title="Done"
                              tasks={project.tasks.filter(
                                (t) => t.category === 'done'
                              )}
                              onTaskClick={onTaskClick}
                            />
                          </div>
                        )}
                      </div>
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
