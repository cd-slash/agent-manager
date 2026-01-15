import { useState, useEffect } from 'react';
import { ChevronLeft, GitPullRequest } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { Sidebar } from '@/components/Sidebar';
import { QuickTaskModal } from '@/components/modals/QuickTaskModal';
import { NewProjectModal } from '@/components/modals/NewProjectModal';
import { ProjectListView } from '@/components/projects/ProjectListView';
import { ProjectDetailView } from '@/components/projects/ProjectDetailView';
import { TaskDetailView } from '@/components/tasks/TaskDetailView';
import { ServerView } from '@/components/servers/ServerView';
import { ServerDetailView } from '@/components/servers/ServerDetailView';
import { ContainerView } from '@/components/containers/ContainerView';
import { ContainerDetailView } from '@/components/containers/ContainerDetailView';
import { SettingsView } from '@/components/settings/SettingsView';

import type { Project, Task, Server, Container, ChatMessage, HistoryEvent } from '@/types';

/**
 * Mock AI Logic & Data Generators
 */
const generateMockChat = (): ChatMessage[] => [
  { id: 1, sender: 'ai', text: "I've analyzed the requirements. Shall I set up the initial scaffold?", time: '10:00 AM' },
  { id: 2, sender: 'user', text: "Yes, please use the latest version of Next.js.", time: '10:05 AM' },
  { id: 3, sender: 'ai', text: "Understood. I'll also configure Tailwind CSS as requested.", time: '10:06 AM' }
];

const generateMockHistory = (): HistoryEvent[] => [
  { id: 1, action: 'Created task', user: 'System', time: '2 days ago' },
  { id: 2, action: 'Changed status to "In Progress"', user: 'User', time: '1 day ago' },
  { id: 3, action: 'Updated requirements', user: 'AI Agent', time: '5 hours ago' }
];

const generateMockProjectChat = (): ChatMessage[] => [
  { id: 1, sender: 'ai', text: "Hello! I'm here to help you plan your project. Tell me about what you want to build, and I'll help draft the requirements.", time: '09:00 AM' },
];

const analyzeAndGenerateTasks = (description: string, name: string): Task[] => {
  const tasks: Task[] = [];
  const text = description.toLowerCase();

  const addTask = (title: string, category: Task['category'], tag: string): Task => {
    const newTask: Task = {
      id: Date.now() + Math.random(),
      title,
      category,
      tag,
      complexity: 'Medium',
      description: `Implementation details for ${title}. This task involves setting up the core architecture and ensuring scalability.`,
      prompt: `Generate production-ready code for ${title} using best practices. Focus on error handling and modularity.`,
      acceptanceCriteria: [
        { id: 1, text: "Unit tests must pass with >80% coverage", done: false },
        { id: 2, text: "Code must follow linting rules", done: true },
        { id: 3, text: "Feature must be responsive on mobile", done: false }
      ],
      tests: [
        { id: 1, name: "should_render_component_correctly", status: "passed" },
        { id: 2, name: "should_handle_invalid_input", status: "pending" },
        { id: 3, name: "should_call_api_on_submit", status: "passed" }
      ],
      chatHistory: generateMockChat(),
      history: generateMockHistory(),
      prCreated: false,
      dependencies: []
    };
    tasks.push(newTask);
    return newTask;
  };

  addTask(`Initialize repository for ${name}`, 'backlog', 'devops');
  addTask('Setup React & Tailwind environment', 'todo', 'frontend');
  addTask('Configure CI/CD Pipeline', 'backlog', 'devops');

  if (text.includes('login') || text.includes('auth')) {
    const designTask = addTask('Design Login & Sign Up screens', 'todo', 'design');
    const authTask = addTask('Implement Authentication logic', 'backlog', 'backend');
    authTask.dependencies.push(designTask.id);
  }

  if (text.includes('database') || text.includes('data')) {
    const dbDesignTask = addTask('Design Database Schema', 'todo', 'database');
    const dbSetupTask = addTask('Setup Firestore/SQL Database', 'backlog', 'backend');
    dbSetupTask.dependencies.push(dbDesignTask.id);
  }

  if (tasks.length < 5) {
    addTask('Draft initial UI Mockups', 'todo', 'design');
    addTask('Define core user stories', 'todo', 'design');
  }

  return tasks;
};

function App() {
  const [activeView, setActiveView] = useState('projects');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isQuickTaskModalOpen, setIsQuickTaskModalOpen] = useState(false);

  const [projects, setProjects] = useState<Project[]>([
    {
      id: 1,
      name: "E-Commerce Platform",
      description: "A full-stack e-commerce solution with user authentication, product catalog, shopping cart, and Stripe payment integration. Includes an admin dashboard for inventory management.",
      tasks: analyzeAndGenerateTasks("e-commerce shop with login and stripe", "E-Commerce Platform"),
      projectChatHistory: generateMockProjectChat(),
      plan: `## Project Requirements\n\nA full-stack e-commerce solution with user authentication, product catalog, shopping cart, and Stripe payment integration.\n\n## Acceptance Criteria\n\n- [ ] User can sign up and login\n- [ ] Products are searchable\n- [ ] Stripe integration works in test mode`
    }
  ]);

  const [servers] = useState<Server[]>([
    { id: 1, name: 'production-api-01', ip: '10.0.0.45', region: 'us-east-1', status: 'online', cpu: 45, mem: 62 },
    { id: 2, name: 'production-db-primary', ip: '10.0.0.12', region: 'us-east-1', status: 'online', cpu: 28, mem: 84 },
    { id: 3, name: 'staging-cluster-01', ip: '10.0.1.05', region: 'us-west-2', status: 'maintenance', cpu: 5, mem: 12 },
  ]);

  const [containers] = useState<Container[]>([
    { id: 'c1', name: 'api-gateway', image: 'nginx:latest', status: 'running', port: '80:8080', server: 'production-api-01' },
    { id: 'c2', name: 'auth-service', image: 'node:18-alpine', status: 'running', port: '3000:3000', server: 'production-api-01' },
    { id: 'c3', name: 'payment-worker', image: 'python:3.9-slim', status: 'stopped', port: '-', server: 'staging-cluster-01' },
    { id: 'c4', name: 'redis-cache', image: 'redis:6', status: 'running', port: '6379:6379', server: 'production-db-primary' },
  ]);

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);

  // Keyboard shortcut for Quick Task
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setIsQuickTaskModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreateProject = (projectData: { name: string; description: string }) => {
    const newTasks = analyzeAndGenerateTasks(projectData.description, projectData.name);
    const newProject: Project = {
      id: Date.now(),
      name: projectData.name,
      description: projectData.description,
      tasks: newTasks,
      projectChatHistory: generateMockProjectChat(),
      plan: `## Project Requirements\n\n${projectData.description}\n\n## Acceptance Criteria\n\n- [ ] Initial scaffold created`
    };
    setProjects([...projects, newProject]);
    setIsNewProjectModalOpen(false);
    setSelectedProjectId(newProject.id);
    setActiveView('projects');
  };

  const handleTaskUpdate = (updatedTask: Task) => {
    setProjects(prevProjects => prevProjects.map(p => {
      if (p.id === selectedProjectId) {
        return {
          ...p,
          tasks: p.tasks.map(t => t.id === updatedTask.id ? updatedTask : t)
        };
      }
      return p;
    }));
  };

  const handleProjectUpdate = (updatedProject: Project) => {
    setProjects(prevProjects => prevProjects.map(p => p.id === updatedProject.id ? updatedProject : p));
  };

  const handleAddTask = (projectId: number, taskTitle: string) => {
    if (!projectId || !taskTitle.trim()) return;

    setProjects(prevProjects => prevProjects.map(p => {
      if (p.id === projectId) {
        const newTask: Task = {
          id: Date.now(),
          title: taskTitle,
          category: 'backlog',
          tag: 'manual',
          complexity: 'Low',
          description: 'Manually added task.',
          chatHistory: [],
          history: [{ id: Date.now(), action: 'Created task', user: 'User', time: 'Just now' }],
          prCreated: false,
          dependencies: []
        };
        return { ...p, tasks: [...p.tasks, newTask] };
      }
      return p;
    }));
  };

  const handleQuickTaskCreate = (projectId: number, title: string) => {
    handleAddTask(projectId, title);
  };

  // Derived state helpers
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const selectedTask = selectedProject?.tasks.find(t => t.id === selectedTaskId);
  const selectedServer = servers.find(s => s.id === selectedServerId);
  const selectedContainer = containers.find(c => c.id === selectedContainerId);

  // View Resolution Logic
  const renderContent = () => {
    if (activeView === 'settings') return <SettingsView />;

    if (activeView === 'servers') {
      if (selectedServerId && selectedServer) {
        return <ServerDetailView server={selectedServer} containers={containers} onBack={() => setSelectedServerId(null)} />;
      }
      return <ServerView servers={servers} onSelectServer={setSelectedServerId} />;
    }

    if (activeView === 'containers') {
      if (selectedContainerId && selectedContainer) {
        return <ContainerDetailView container={selectedContainer} onBack={() => setSelectedContainerId(null)} />;
      }
      return <ContainerView containers={containers} onSelectContainer={setSelectedContainerId} />;
    }

    if (activeView === 'projects') {
      if (selectedProjectId) {
        if (selectedTaskId && selectedTask) {
          return (
            <TaskDetailView
              task={selectedTask}
              project={selectedProject}
              onBack={() => setSelectedTaskId(null)}
              onUpdate={handleTaskUpdate}
            />
          );
        }
        return (
          <ProjectDetailView
            project={selectedProject!}
            onTaskClick={(task) => setSelectedTaskId(task.id)}
            onBack={() => setSelectedProjectId(null)}
            onUpdateProject={handleProjectUpdate}
            onAddTask={handleAddTask}
          />
        );
      }
      return (
        <ProjectListView
          projects={projects}
          onSelectProject={(p) => setSelectedProjectId(p.id)}
          onNewProject={() => setIsNewProjectModalOpen(true)}
        />
      );
    }
    return null;
  };

  const handleViewChange = (view: string) => {
    setActiveView(view);
    if (view !== 'projects') { setSelectedProjectId(null); setSelectedTaskId(null); }
    if (view !== 'servers') { setSelectedServerId(null); }
    if (view !== 'containers') { setSelectedContainerId(null); }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        isCollapsed={sidebarCollapsed}
        toggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onQuickTask={() => setIsQuickTaskModalOpen(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-20">
          <div className="flex items-center min-w-0 flex-1 mr-4">
            {selectedTaskId && selectedTask ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setSelectedTaskId(null)}
                  className="mr-3"
                >
                  <ChevronLeft size={20} />
                </Button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-white flex items-center">
                    <span className="truncate">{selectedTask.title}</span>
                    {selectedTask.prCreated && (
                      <Badge variant="purple" className="ml-2 text-[10px]">
                        <GitPullRequest size={10} className="mr-1" /> #{selectedTask.prNumber}
                      </Badge>
                    )}
                    <Badge
                      variant={
                        selectedTask.category === 'done' ? 'success' :
                        selectedTask.category === 'in-progress' ? 'info' :
                        'secondary'
                      }
                      className="ml-2 uppercase text-[10px]"
                    >
                      {selectedTask.category}
                    </Badge>
                  </h2>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold truncate">
                    {selectedProject?.name} / Tasks
                  </div>
                </div>
              </>
            ) : selectedProjectId && selectedProject ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setSelectedProjectId(null)}
                  className="mr-3"
                >
                  <ChevronLeft size={20} />
                </Button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-white truncate">
                    {selectedProject.name}
                  </h2>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    Projects
                  </div>
                </div>
              </>
            ) : (
              <div>
                <h2 className="text-sm font-bold text-white capitalize">
                  {activeView}
                </h2>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  Dashboard
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </main>

      <QuickTaskModal
        isOpen={isQuickTaskModalOpen}
        onClose={() => setIsQuickTaskModalOpen(false)}
        projects={projects}
        onCreate={handleQuickTaskCreate}
      />

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onCreate={handleCreateProject}
      />
    </div>
  );
}

export default App;
