import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
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

// Helper to format timestamps to readable time strings
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

function App() {
  const [activeView, setActiveView] = useState('projects');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isQuickTaskModalOpen, setIsQuickTaskModalOpen] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<Id<"servers"> | null>(null);
  const [selectedContainerId, setSelectedContainerId] = useState<Id<"containers"> | null>(null);

  // Convex queries
  const projectsData = useQuery(api.projects.list) ?? [];
  const tasksData = useQuery(
    api.tasks.listByProject,
    selectedProjectId ? { projectId: selectedProjectId } : "skip"
  ) ?? [];
  const allTasksData = useQuery(api.tasks.listAllWithProjects) ?? [];
  const serversData = useQuery(api.servers.list) ?? [];
  const containersData = useQuery(api.containers.list) ?? [];

  // Get selected task with full details
  const selectedTaskDetails = useQuery(
    api.tasks.get,
    selectedTaskId ? { id: selectedTaskId } : "skip"
  );

  // Get pull request for selected task
  const selectedTaskPR = useQuery(
    api.pullRequests.getByTask,
    selectedTaskId ? { taskId: selectedTaskId } : "skip"
  );

  // Convex mutations
  const createProject = useMutation(api.projects.create);
  const updateProject = useMutation(api.projects.update);
  const updateProjectPlan = useMutation(api.projects.updatePlan);
  const createTask = useMutation(api.tasks.create);
  const updateTask = useMutation(api.tasks.update);
  const updateTaskCategory = useMutation(api.tasks.updateCategory);
  const sendProjectMessage = useMutation(api.chat.sendProjectMessage);
  const sendTaskMessage = useMutation(api.chat.sendTaskMessage);

  // Transform Convex data to legacy format for compatibility with existing components
  const projects: Project[] = useMemo(() => {
    return projectsData.map(p => {
      // Get tasks for this project from all tasks data
      const projectTasks = allTasksData
        .filter(t => t.projectId === p._id)
        .map(t => ({
          id: t._id as unknown as number, // Cast for legacy compatibility
          title: t.title,
          category: t.category,
          tag: t.tag,
          complexity: t.complexity,
          description: t.description,
          prompt: t.prompt,
          chatHistory: [],
          history: [],
          prCreated: false,
          dependencies: [],
        } as Task));

      return {
        id: p._id as unknown as number, // Cast for legacy compatibility
        name: p.name,
        description: p.description,
        tasks: projectTasks,
        projectChatHistory: [],
        plan: p.plan,
      } as Project;
    });
  }, [projectsData, allTasksData]);

  // Transform servers data
  const servers: Server[] = useMemo(() => {
    return serversData.map(s => ({
      id: s._id as unknown as number,
      name: s.name,
      ip: s.ip,
      region: s.region,
      status: s.status,
      cpu: s.cpu,
      mem: s.mem,
    }));
  }, [serversData]);

  // Transform containers data
  const containers: Container[] = useMemo(() => {
    return containersData.map(c => ({
      id: c._id as unknown as string,
      name: c.name,
      image: c.image,
      status: c.status as 'running' | 'stopped',
      port: c.port,
      server: c.serverName ?? '',
    }));
  }, [containersData]);

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

  const handleCreateProject = async (projectData: { name: string; description: string }) => {
    const projectId = await createProject({
      name: projectData.name,
      description: projectData.description,
      plan: `## Project Requirements\n\n${projectData.description}\n\n## Acceptance Criteria\n\n- [ ] Initial scaffold created`,
    });

    // Create some initial tasks
    await createTask({
      projectId,
      title: `Initialize repository for ${projectData.name}`,
      description: 'Set up the initial project repository and structure.',
      category: 'backlog',
      tag: 'devops',
      complexity: 'Low',
    });

    await createTask({
      projectId,
      title: 'Setup development environment',
      description: 'Configure development tools and dependencies.',
      category: 'todo',
      tag: 'devops',
      complexity: 'Medium',
    });

    setIsNewProjectModalOpen(false);
    setSelectedProjectId(projectId);
    setActiveView('projects');
  };

  const handleTaskUpdate = async (updatedTask: Task) => {
    const taskId = updatedTask.id as unknown as Id<"tasks">;
    await updateTask({
      id: taskId,
      title: updatedTask.title,
      description: updatedTask.description,
      prompt: updatedTask.prompt,
      tag: updatedTask.tag,
      complexity: updatedTask.complexity,
    });
  };

  const handleProjectUpdate = async (updatedProject: Project) => {
    const projectId = updatedProject.id as unknown as Id<"projects">;
    await updateProject({
      id: projectId,
      name: updatedProject.name,
      description: updatedProject.description,
    });
    if (updatedProject.plan) {
      await updateProjectPlan({
        id: projectId,
        plan: updatedProject.plan,
      });
    }
  };

  const handleAddTask = async (projectId: number, taskTitle: string) => {
    if (!taskTitle.trim()) return;

    const convexProjectId = projectId as unknown as Id<"projects">;
    await createTask({
      projectId: convexProjectId,
      title: taskTitle,
      description: 'Manually added task.',
      category: 'backlog',
      tag: 'manual',
      complexity: 'Low',
    });
  };

  const handleQuickTaskCreate = (projectId: number, title: string) => {
    handleAddTask(projectId, title);
  };

  // Derived state helpers
  const selectedProject = projects.find(p => (p.id as unknown as Id<"projects">) === selectedProjectId);
  const selectedTask = useMemo(() => {
    if (!selectedTaskDetails) return undefined;

    // Transform to legacy format
    const task: Task = {
      id: selectedTaskDetails._id as unknown as number,
      title: selectedTaskDetails.title,
      category: selectedTaskDetails.category,
      tag: selectedTaskDetails.tag,
      complexity: selectedTaskDetails.complexity,
      description: selectedTaskDetails.description,
      prompt: selectedTaskDetails.prompt,
      acceptanceCriteria: selectedTaskDetails.acceptanceCriteria?.map(ac => ({
        id: ac._id as unknown as number,
        text: ac.text,
        done: ac.done,
      })),
      tests: selectedTaskDetails.tests?.map(t => ({
        id: t._id as unknown as number,
        name: t.name,
        status: t.status,
      })),
      chatHistory: selectedTaskDetails.chatHistory?.map(ch => ({
        id: ch._id as unknown as number,
        sender: ch.sender,
        text: ch.text,
        time: formatTime(ch.createdAt),
      })),
      history: selectedTaskDetails.history?.map(h => ({
        id: h._id as unknown as number,
        action: h.action,
        user: h.user,
        time: formatTime(h.createdAt),
      })),
      prCreated: !!selectedTaskPR,
      prNumber: selectedTaskPR?.prNumber,
      prStatus: selectedTaskPR?.status,
      dependencies: selectedTaskDetails.dependencies?.filter(d => d !== null).map(d => d._id as unknown as number) ?? [],
    };
    return task;
  }, [selectedTaskDetails, selectedTaskPR]);

  const selectedServer = servers.find(s => (s.id as unknown as Id<"servers">) === selectedServerId);
  const selectedContainer = containers.find(c => (c.id as unknown as Id<"containers">) === selectedContainerId);

  // View Resolution Logic
  const renderContent = () => {
    if (activeView === 'settings') return <SettingsView />;

    if (activeView === 'servers') {
      if (selectedServerId && selectedServer) {
        return <ServerDetailView server={selectedServer} containers={containers} />;
      }
      return <ServerView servers={servers} onSelectServer={(id) => setSelectedServerId(id as unknown as Id<"servers">)} />;
    }

    if (activeView === 'containers') {
      if (selectedContainerId && selectedContainer) {
        return <ContainerDetailView container={selectedContainer} onBack={() => setSelectedContainerId(null)} />;
      }
      return <ContainerView containers={containers} onSelectContainer={(id) => setSelectedContainerId(id as unknown as Id<"containers">)} />;
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
            setSelectedProjectId(projectId as unknown as Id<"projects">);
            setSelectedTaskId(task.id as unknown as Id<"tasks">);
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
            onTaskClick={(task) => setSelectedTaskId(task.id as unknown as Id<"tasks">)}
            onBack={() => setSelectedProjectId(null)}
            onUpdateProject={handleProjectUpdate}
            onAddTask={handleAddTask}
          />
        );
      }
      return (
        <ProjectListView
          projects={projects}
          onSelectProject={(p) => setSelectedProjectId(p.id as unknown as Id<"projects">)}
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
