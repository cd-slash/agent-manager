import { TaskCard } from './TaskCard';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Task } from '@/types';

interface KanbanColumnProps {
  title: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function KanbanColumn({ title, tasks, onTaskClick }: KanbanColumnProps) {
  return (
    <div className="flex flex-col h-full min-w-[280px] w-full bg-surface/50 rounded-xl border border-border/50">
      <div className="p-card border-b border-border font-semibold text-foreground flex justify-between items-center sticky top-0 bg-surface/95 backdrop-blur-sm rounded-t-xl z-10">
        {title}
        <Badge variant="secondary" className="text-xs">
          {tasks.length}
        </Badge>
      </div>
      <ScrollArea className="flex-1 p-component">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onClick={onTaskClick} />
        ))}
      </ScrollArea>
    </div>
  );
}
