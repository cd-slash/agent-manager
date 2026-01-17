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
import { AllTasksView } from '@/components/tasks/AllTasksView';
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
      tasks: [
        // Original generated tasks
        ...analyzeAndGenerateTasks("e-commerce shop with login and stripe", "E-Commerce Platform"),
        // 20 additional example tasks for table formatting testing
        {
          id: 1001, title: "Implement product search with filters", category: "done", tag: "frontend",
          complexity: "High", description: "Add search functionality with category, price, and rating filters.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: true, prNumber: 42, prStatus: "merged", dependencies: []
        },
        {
          id: 1002, title: "Setup Redis caching layer", category: "done", tag: "backend",
          complexity: "Medium", description: "Implement Redis for session and product data caching.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: true, prNumber: 38, prStatus: "merged", dependencies: []
        },
        {
          id: 1003, title: "Create inventory management API", category: "in-progress", tag: "backend",
          complexity: "High", description: "RESTful API endpoints for inventory CRUD operations.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: true, prNumber: 45, prStatus: "open", dependencies: []
        },
        {
          id: 1004, title: "Design mobile-responsive checkout", category: "in-progress", tag: "design",
          complexity: "Medium", description: "Figma mockups for mobile checkout experience.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: false, dependencies: []
        },
        {
          id: 1005, title: "Implement Stripe webhook handlers", category: "in-progress", tag: "backend",
          complexity: "High", description: "Handle payment success, failure, and refund webhooks.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: true, prNumber: 47, prStatus: "open", dependencies: []
        },
        {
          id: 1006, title: "Add unit tests for cart service", category: "todo", tag: "testing",
          complexity: "Medium", description: "Comprehensive test coverage for shopping cart logic.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: false, dependencies: []
        },
        {
          id: 1007, title: "Optimize product image loading", category: "todo", tag: "frontend",
          complexity: "Low", description: "Implement lazy loading and WebP format support.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: false, dependencies: []
        },
        {
          id: 1008, title: "Create admin dashboard wireframes", category: "done", tag: "design",
          complexity: "Low", description: "Low-fidelity wireframes for admin panel layout.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: true, prNumber: 31, prStatus: "merged", dependencies: []
        },
        {
          id: 1009, title: "Setup Kubernetes deployment", category: "backlog", tag: "devops",
          complexity: "High", description: "K8s manifests for production deployment.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: false, dependencies: []
        },
        {
          id: 1010, title: "Implement order tracking system", category: "backlog", tag: "backend",
          complexity: "High", description: "Real-time order status updates with email notifications.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: false, dependencies: []
        },
        {
          id: 1011, title: "Add product review system", category: "todo", tag: "frontend",
          complexity: "Medium", description: "User reviews with star ratings and image uploads.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: false, dependencies: []
        },
        {
          id: 1012, title: "Setup monitoring with Grafana", category: "backlog", tag: "devops",
          complexity: "Medium", description: "Prometheus metrics and Grafana dashboards.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: false, dependencies: []
        },
        {
          id: 1013, title: "Implement wish list feature", category: "done", tag: "frontend",
          complexity: "Low", description: "Allow users to save products to a wish list.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: true, prNumber: 33, prStatus: "merged", dependencies: []
        },
        {
          id: 1014, title: "Create product recommendation engine", category: "backlog", tag: "backend",
          complexity: "High", description: "ML-based product recommendations using purchase history.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: false, dependencies: []
        },
        {
          id: 1015, title: "Add multi-language support", category: "backlog", tag: "frontend",
          complexity: "Medium", description: "i18n implementation for English, Spanish, and French.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: false, dependencies: []
        },
        {
          id: 1016, title: "Implement coupon code system", category: "in-progress", tag: "backend",
          complexity: "Medium", description: "Discount codes with various rules and expiration.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: true, prNumber: 48, prStatus: "open", dependencies: []
        },
        {
          id: 1017, title: "Setup E2E testing with Playwright", category: "todo", tag: "testing",
          complexity: "Medium", description: "End-to-end tests for critical user flows.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: false, dependencies: []
        },
        {
          id: 1018, title: "Add social login (Google, Apple)", category: "todo", tag: "backend",
          complexity: "Medium", description: "OAuth integration for social sign-in options.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: false, dependencies: []
        },
        {
          id: 1019, title: "Create email template system", category: "done", tag: "backend",
          complexity: "Low", description: "Responsive email templates for order confirmations.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: true, prNumber: 36, prStatus: "merged", dependencies: []
        },
        {
          id: 1020, title: "Implement product variant handling", category: "todo", tag: "backend",
          complexity: "High", description: "Support for size, color, and other product variants.",
          chatHistory: generateMockChat(), history: generateMockHistory(), prCreated: false, dependencies: []
        },
      ],
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
        return <ServerDetailView server={selectedServer} containers={containers} />;
      }
      return <ServerView servers={servers} onSelectServer={setSelectedServerId} />;
    }

    if (activeView === 'containers') {
      if (selectedContainerId && selectedContainer) {
        return <ContainerDetailView container={selectedContainer} onBack={() => setSelectedContainerId(null)} />;
      }
      return <ContainerView containers={containers} onSelectContainer={setSelectedContainerId} />;
    }

    if (activeView === 'tasks') {
      if (selectedTaskId && selectedTask && selectedProject) {
        return (
          <TaskDetailView
            task={selectedTask}
            project={selectedProject}
            onBack={() => {
              setSelectedTaskId(null);
              setSelectedProjectId(null);
            }}
            onUpdate={handleTaskUpdate}
          />
        );
      }
      return (
        <AllTasksView
          projects={projects}
          onTaskClick={(task, projectId) => {
            setSelectedProjectId(projectId);
            setSelectedTaskId(task.id);
          }}
        />
      );
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
    if (view !== 'projects' && view !== 'tasks') { setSelectedProjectId(null); setSelectedTaskId(null); }
    if (view === 'projects') { setSelectedTaskId(null); }
    if (view === 'tasks') { setSelectedProjectId(null); setSelectedTaskId(null); }
    if (view !== 'servers') { setSelectedServerId(null); }
    if (view !== 'containers') { setSelectedContainerId(null); }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        isCollapsed={sidebarCollapsed}
        toggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onQuickTask={() => setIsQuickTaskModalOpen(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 border-b border-border bg-surface/80 backdrop-blur-md flex items-center justify-between px-page shrink-0 z-20">
          <div className="flex items-center min-w-0 flex-1 mr-card">
            {selectedTaskId && selectedTask ? (
              <>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setSelectedTaskId(null)}
                  className="mr-component"
                >
                  <ChevronLeft size={20} />
                </Button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-foreground flex items-center">
                    <span className="truncate">{selectedTask.title}</span>
                    {selectedTask.prCreated && (
                      <Badge variant="purple" className="ml-item text-[10px]">
                        <GitPullRequest size={10} className="mr-compact" /> #{selectedTask.prNumber}
                      </Badge>
                    )}
                    <Badge
                      variant={
                        selectedTask.category === 'done' ? 'success' :
                        selectedTask.category === 'in-progress' ? 'info' :
                        'secondary'
                      }
                      className="ml-item uppercase text-[10px]"
                    >
                      {selectedTask.category}
                    </Badge>
                  </h2>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold truncate">
                    {selectedProject?.name} / Tasks
                  </div>
                </div>
              </>
            ) : selectedProjectId && selectedProject ? (
              <>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setSelectedProjectId(null)}
                  className="mr-component"
                >
                  <ChevronLeft size={20} />
                </Button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-foreground truncate">
                    {selectedProject.name}
                  </h2>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Projects
                  </div>
                </div>
              </>
            ) : selectedServerId && selectedServer ? (
              <>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setSelectedServerId(null)}
                  className="mr-component"
                >
                  <ChevronLeft size={20} />
                </Button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-foreground flex items-center">
                    <span className="truncate">{selectedServer.name}</span>
                    <Badge
                      variant={selectedServer.status === 'online' ? 'success' : 'warning'}
                      className="ml-item uppercase text-[10px]"
                    >
                      {selectedServer.status}
                    </Badge>
                  </h2>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Servers
                  </div>
                </div>
              </>
            ) : (
              <div>
                <h2 className="text-sm font-bold text-foreground capitalize">
                  {activeView}
                </h2>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
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
