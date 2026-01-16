import { useState } from 'react';
import {
  List,
  FileText,
  Info,
  Plus,
  Grid,
  FileEdit,
  Save,
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
import type { Project, Task } from '@/types';

interface ProjectDetailViewProps {
  project: Project;
  onTaskClick: (task: Task) => void;
  onBack: () => void;
  onUpdateProject: (project: Project) => void;
  onAddTask: (projectId: number, title: string) => void;
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

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskTitle.trim()) return;
    onAddTask(project.id, quickTaskTitle);
    setQuickTaskTitle('');
  };

  const handleChatSend = (text: string) => {
    const userMsg = {
      id: Date.now(),
      sender: 'user' as const,
      text: text,
      time: 'Just now',
    };
    let updatedChat = [...(project.projectChatHistory || []), userMsg];

    setTimeout(() => {
      const aiMsg = {
        id: Date.now() + 1,
        sender: 'ai' as const,
        text: "I've updated the plan based on your request. I also suggest breaking this down into 3 new tasks.",
        time: 'Just now',
      };
      const updatedProject = {
        ...project,
        projectChatHistory: [...updatedChat, aiMsg],
        plan: planText + `\n\n- Added requirement: ${text}`,
      };
      onUpdateProject(updatedProject);
      setPlanText(updatedProject.plan!);
    }, 1000);

    const tempProject = { ...project, projectChatHistory: updatedChat };
    onUpdateProject(tempProject);
  };

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in duration-300">
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="px-page pt-section shrink-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full justify-start">
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

              <div className="py-6 flex gap-page items-start">
                <div className="flex-1 min-w-0">
                  <TabsContent value="tasks" className="!mt-0">
                    <div className="h-full flex flex-col">
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
                      <div className="flex-1 overflow-hidden">
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
                    </div>
                  </TabsContent>

                  <TabsContent value="plan" className="!mt-0">
                    <div className="h-full flex flex-col">
                      <div className="mb-3 flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center">
                          <FileEdit size={16} className="mr-2" />
                          Project Plan & Requirements
                        </h3>
                        <span className="text-xs text-muted-foreground flex items-center">
                          <Save size={12} className="mr-1" /> Auto-saved
                        </span>
                      </div>
                      <Textarea
                        value={planText}
                        onChange={(e) => setPlanText(e.target.value)}
                        className="flex-1 font-mono text-sm leading-relaxed resize-none min-h-[400px] rounded-lg"
                        placeholder="Define your project requirements here..."
                      />
                    </div>
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

                <div className="w-1/3 shrink-0 sticky top-0 self-start h-[calc(100vh-12rem)]">
                  <AgentChatPanel
                    chatHistory={project.projectChatHistory}
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
