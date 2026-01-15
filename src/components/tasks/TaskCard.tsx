import { MessageSquare, GitPullRequest, Link as LinkIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Task } from '@/types';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  return (
    <div
      onClick={() => onClick(task)}
      className="bg-slate-800 border border-slate-700 hover:border-blue-500/50 rounded-lg p-3 shadow-sm hover:shadow-md transition-all duration-200 mb-3 cursor-pointer group"
    >
      <div className="flex justify-between items-start mb-2">
        <Badge variant="outline" className="text-[10px] uppercase">
          {task.tag}
        </Badge>
        {task.prCreated && (
          <Badge variant="purple" className="text-[10px]">
            <GitPullRequest size={10} className="mr-1" /> PR
          </Badge>
        )}
      </div>
      <p className="text-sm font-medium text-slate-200 leading-snug mb-3">
        {task.title}
      </p>
      {task.dependencies && task.dependencies.length > 0 && (
        <div className="flex items-center text-[10px] text-amber-500 mb-2">
          <LinkIcon size={10} className="mr-1" />
          <span>{task.dependencies.length} dependency</span>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-slate-700/50 pt-2 text-xs text-slate-500">
        <div className="flex items-center space-x-2">
          <MessageSquare size={12} />{' '}
          <span>{task.chatHistory?.length || 0}</span>
        </div>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400">
          Details &rarr;
        </span>
      </div>
    </div>
  );
}
