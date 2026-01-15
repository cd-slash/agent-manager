import { useState } from 'react';
import {
  List,
  FileText,
  Info,
  Plus,
  Grid,
  FileEdit,
  Save,
  GitPullRequest,
  ChevronDown,
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
    <div className="flex flex-col h-full bg-slate-950">
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Tabs + Content */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-slate-800">
          <div className="px-6 pt-6 shrink-0">
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

              <div className="flex-1 overflow-y-auto min-w-0">
                <TabsContent value="tasks" className="mt-0">
                  <div className="h-full flex flex-col py-6">
                    <div className="flex justify-between items-center mb-6">
                      <form
                        onSubmit={handleQuickAdd}
                        className="flex-1 max-w-lg relative mr-4"
                      >
                        <Plus
                          size={16}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                        />
                        <Input
                          value={quickTaskTitle}
                          onChange={(e) => setQuickTaskTitle(e.target.value)}
                          placeholder="Add a new task..."
                          className="pl-10"
                        />
                      </form>
                      <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg p-1">
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
                        <div className="flex h-full space-x-6 min-w-max overflow-x-auto pb-2">
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

                <TabsContent value="plan" className="mt-0">
                  <div className="h-full flex flex-col py-6">
                    <div className="mb-4 flex justify-between items-center">
                      <h3 className="font-semibold text-slate-200 flex items-center">
                        <FileEdit size={16} className="mr-2 text-blue-400" />
                        Project Plan & Requirements
                      </h3>
                      <Button variant="ghost" size="sm" className="text-blue-400">
                        <Save size={12} className="mr-1" /> Auto-saved
                      </Button>
                    </div>
                    <Textarea
                      value={planText}
                      onChange={(e) => setPlanText(e.target.value)}
                      className="flex-1 font-mono text-sm leading-relaxed resize-none min-h-[400px]"
                      placeholder="Define your project requirements here..."
                    />
                  </div>
                </TabsContent>

                <TabsContent value="details" className="mt-0">
                  <div className="h-full flex flex-col py-6 animate-in fade-in duration-300">
                    <div className="space-y-6 w-full">
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                            Project Name
                          </label>
                          <Input value={project.name} readOnly />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                            Description
                          </label>
                          <Textarea
                            value={project.description}
                            readOnly
                            className="h-24 resize-none"
                          />
                        </div>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                        <h4 className="text-sm font-medium text-white mb-2 flex items-center">
                          <GitPullRequest
                            size={16}
                            className="mr-2 text-purple-400"
                          />
                          Repository Configuration
                        </h4>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                            Repository URL
                          </label>
                          <div className="flex">
                            <Input
                              value={`github.com/demo-user/${project.name.toLowerCase().replace(/\s+/g, '-')}`}
                              readOnly
                              className="rounded-r-none text-blue-400 font-mono"
                            />
                            <Button variant="outline" className="rounded-l-none">
                              Copy
                            </Button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
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
                      </div>

                      <div className="flex justify-end pt-4">
                        <Button variant="destructive">
                          <Trash2 size={16} className="mr-2" /> Archive Project
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
        <AgentChatPanel
          chatHistory={project.projectChatHistory}
          onSendMessage={handleChatSend}
        />
      </div>
    </div>
  );
}
