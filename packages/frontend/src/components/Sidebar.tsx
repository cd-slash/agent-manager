import {
  FolderOpen,
  Server,
  Box,
  Settings,
  Layout,
  Plus,
  ChevronsLeft,
  ChevronsRight,
  CheckSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  isCollapsed: boolean;
  toggleCollapse: () => void;
  onQuickTask: () => void;
}

const menuItems = [
  { id: 'projects', label: 'Projects', icon: FolderOpen },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'containers', label: 'Containers', icon: Box },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({
  activeView,
  onViewChange,
  isCollapsed,
  toggleCollapse,
  onQuickTask,
}: SidebarProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 shrink-0 z-30',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Top Header */}
        <div
          className={cn(
            'h-16 flex items-center border-b border-sidebar-border transition-all duration-300',
            isCollapsed ? 'justify-center' : 'px-sidebar justify-between'
          )}
        >
          {!isCollapsed && (
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shrink-0">
                <Layout className="text-primary-foreground w-5 h-5" />
              </div>
              <span className="ml-3 font-bold text-sidebar-foreground text-lg tracking-tight">
                DevPlanner
              </span>
            </div>
          )}

          <Button
            variant="outline"
            size="icon-sm"
            onClick={toggleCollapse}
            className="text-muted-foreground hover:text-sidebar-foreground"
          >
            {isCollapsed ? (
              <ChevronsRight size={20} />
            ) : (
              <ChevronsLeft size={20} />
            )}
          </Button>
        </div>

        {/* Nav Items */}
        <nav className={cn(
          "flex-1 space-y-item overflow-y-auto py-sidebar",
          isCollapsed ? "px-2 flex flex-col items-center" : "px-sidebar"
        )}>
          {menuItems.map((item) => {
            const isActive =
              activeView === item.id ||
              activeView.startsWith(item.id.slice(0, -1));

            const NavButton = (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  'flex items-center rounded-lg transition-all duration-200 group relative h-12',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/20'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isCollapsed ? 'justify-center w-12' : 'w-full px-item'
                )}
              >
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  <item.icon
                    size={20}
                    className={cn(
                      isActive
                        ? 'text-sidebar-primary-foreground'
                        : 'text-muted-foreground group-hover:text-sidebar-accent-foreground'
                    )}
                  />
                </div>

                {!isCollapsed && (
                  <span className="ml-2 font-medium text-sm truncate">
                    {item.label}
                  </span>
                )}
              </button>
            );

            if (isCollapsed) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{NavButton}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return NavButton;
          })}
        </nav>

        {/* Quick Task Button */}
        <div className={cn(
          isCollapsed ? "px-2 pb-2 flex justify-center" : "px-sidebar pb-sidebar"
        )}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onQuickTask}
                className={cn(
                  'flex items-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 group border border-primary-foreground/10 h-12',
                  isCollapsed ? 'justify-center w-12' : 'w-full px-item'
                )}
              >
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  <Plus size={20} />
                </div>
                {!isCollapsed && (
                  <div className="ml-3 mr-1 flex items-center justify-between flex-1 overflow-hidden">
                    <span className="font-semibold text-sm">New Task</span>
                    <span className="flex items-center gap-0.5">
                      <kbd className="text-[10px] bg-primary-foreground/20 px-sm py-xs rounded text-primary-foreground/90 font-sans border border-primary-foreground/10">
                        Ctrl
                      </kbd>
                      <kbd className="text-[10px] bg-primary-foreground/20 px-sm py-xs rounded text-primary-foreground/90 font-sans border border-primary-foreground/10">
                        T
                      </kbd>
                    </span>
                  </div>
                )}
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right">Quick Task (Ctrl+T)</TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Bottom Actions */}
        <div className="px-sidebar pb-page">
          <div
            className={cn(
              'flex items-center py-3 px-item rounded-lg hover:bg-sidebar-accent/50 cursor-pointer transition-colors',
              isCollapsed && 'justify-center'
            )}
          >
            <Avatar className="h-12 w-12 border-2 border-sidebar">
              <AvatarFallback className="bg-feature-purple text-primary-foreground text-sm font-bold">
                JD
              </AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <div className="ml-3 flex flex-col overflow-hidden">
                <span className="text-sm font-medium text-sidebar-foreground truncate">
                  John Doe
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  Lead Developer
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
