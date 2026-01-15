import {
  FolderOpen,
  Server,
  Box,
  Settings,
  Layout,
  Plus,
  ChevronsLeft,
  ChevronsRight,
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
        <nav className="flex-1 p-sidebar space-y-item overflow-y-auto">
          {menuItems.map((item) => {
            const isActive =
              activeView === item.id ||
              activeView.startsWith(item.id.slice(0, -1));

            const NavButton = (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  'w-full flex items-center p-item rounded-lg transition-all duration-200 group relative',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/20'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isCollapsed && 'justify-center'
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
        <div className="px-sidebar pb-item">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onQuickTask}
                className={cn(
                  'w-full flex items-center p-item rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 group border border-primary-foreground/10',
                  isCollapsed && 'justify-center'
                )}
              >
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  <Plus size={20} />
                </div>
                {!isCollapsed && (
                  <div className="ml-3 flex items-center justify-between flex-1 overflow-hidden">
                    <span className="font-semibold text-sm">New Task</span>
                    <kbd className="text-[10px] bg-primary-foreground/20 px-sm py-xs rounded text-primary-foreground/90 font-sans border border-primary-foreground/10">
                      Ctrl+T
                    </kbd>
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
        <div className="p-sidebar border-t border-sidebar-border">
          <div
            className={cn(
              'flex items-center p-item rounded-lg hover:bg-sidebar-accent/50 cursor-pointer transition-colors',
              isCollapsed && 'justify-center'
            )}
          >
            <Avatar className="h-8 w-8 border-2 border-sidebar">
              <AvatarFallback className="bg-feature-purple text-primary-foreground text-xs font-bold">
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
