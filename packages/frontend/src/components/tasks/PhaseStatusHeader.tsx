import { Check, Clock, AlertCircle, SkipForward, Circle, Settings2, DollarSign, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  PHASE_DISPLAY_NAMES,
  type TaskPhase,
  type PhaseStatus,
  type TaskPhaseDoc,
} from '@/types';

interface PhaseStatusHeaderProps {
  phase: TaskPhase;
  phaseRecord: TaskPhaseDoc | null;
  onViewConfig?: () => void;
  className?: string;
}

function getStatusBadgeVariant(status: PhaseStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'in_progress':
      return 'secondary';
    case 'failed':
      return 'destructive';
    case 'skipped':
    case 'pending':
    default:
      return 'outline';
  }
}

function getStatusIcon(status: PhaseStatus) {
  switch (status) {
    case 'completed':
      return <Check size={12} className="mr-1" />;
    case 'in_progress':
      return <Clock size={12} className="mr-1 animate-pulse" />;
    case 'failed':
      return <AlertCircle size={12} className="mr-1" />;
    case 'skipped':
      return <SkipForward size={12} className="mr-1" />;
    case 'pending':
    default:
      return <Circle size={12} className="mr-1" />;
  }
}

function formatDuration(startedAt: number, completedAt?: number): string {
  const end = completedAt || Date.now();
  const durationMs = end - startedAt;

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatModelName(model: string): string {
  // Convert model ID to display name
  if (model.includes('sonnet-4')) return 'Claude Sonnet 4';
  if (model.includes('opus-4')) return 'Claude Opus 4';
  if (model.includes('3-5-sonnet')) return 'Claude 3.5 Sonnet';
  if (model.includes('3-5-haiku')) return 'Claude 3.5 Haiku';
  return model;
}

export function PhaseStatusHeader({ phase, phaseRecord, onViewConfig, className }: PhaseStatusHeaderProps) {
  const status = phaseRecord?.status || 'pending';
  const isActive = status === 'in_progress';
  const isComplete = status === 'completed' || status === 'skipped';

  return (
    <section className={cn('mb-6', className)}>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
        Phase Status
      </h3>
      <div className={cn(
        'bg-surface border border-border rounded-lg p-4',
        isActive && 'border-primary/50',
        status === 'failed' && 'border-destructive/50'
      )}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Badge variant={getStatusBadgeVariant(status)} className="capitalize">
              {getStatusIcon(status)}
              {status.replace('_', ' ')}
            </Badge>

            {phaseRecord?.model && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span className="font-medium">
                  {phaseRecord.provider || 'anthropic'}/{formatModelName(phaseRecord.model)}
                </span>
              </div>
            )}
          </div>

          {onViewConfig && (
            <Button variant="ghost" size="sm" onClick={onViewConfig}>
              <Settings2 size={14} className="mr-1.5" />
              View Config
            </Button>
          )}
        </div>

        {(phaseRecord?.startedAt || phaseRecord?.totalCostUsd !== undefined || phaseRecord?.numTurns !== undefined) && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-sm">
            {phaseRecord?.startedAt && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock size={14} />
                <span>Duration: {formatDuration(phaseRecord.startedAt, phaseRecord.completedAt)}</span>
              </div>
            )}

            {phaseRecord?.totalCostUsd !== undefined && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <DollarSign size={14} />
                <span>Cost: ${phaseRecord.totalCostUsd.toFixed(4)}</span>
              </div>
            )}

            {phaseRecord?.numTurns !== undefined && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Repeat size={14} />
                <span>Turns: {phaseRecord.numTurns}</span>
              </div>
            )}
          </div>
        )}

        {phaseRecord?.error && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-sm text-destructive font-medium mb-1">Error</div>
            <pre className="text-xs text-muted-foreground bg-background p-2 rounded overflow-x-auto">
              {phaseRecord.error}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

// Compact inline version for tabs
export function PhaseStatusBadge({ phaseRecord }: { phaseRecord: TaskPhaseDoc | null }) {
  const status = phaseRecord?.status || 'pending';

  return (
    <Badge variant={getStatusBadgeVariant(status)} className="capitalize text-[10px] px-1.5 py-0">
      {getStatusIcon(status)}
      {status.replace('_', ' ')}
    </Badge>
  );
}
