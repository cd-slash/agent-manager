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
                    ? 'border border-input bg-surface-elevated text-sidebar-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isCollapsed ? 'justify-center w-12' : 'w-full px-item'
                )}
              >
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  <item.icon
                    size={20}
                    className={cn(
                      isActive
                        ? 'text-sidebar-foreground'
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
              <Button
                variant="outline"
                onClick={onQuickTask}
                className={cn(
                  'h-10',
                  isCollapsed ? 'w-10 px-0' : 'w-full justify-between'
                )}
              >
                <span className="flex items-center gap-2">
                  <Plus size={16} />
                  {!isCollapsed && <span>New Task</span>}
                </span>
                {!isCollapsed && (
                  <span className="flex items-center gap-0.5">
                    <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 inline-flex">
                      Ctrl
                    </kbd>
                    <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 inline-flex">
                      T
                    </kbd>
                  </span>
                )}
              </Button>
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
