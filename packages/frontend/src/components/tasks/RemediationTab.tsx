import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import {
  Wrench,
  Play,
  Settings2,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Bot,
  User,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PhaseStatusHeader } from './PhaseStatusHeader';
import { PhaseConfigPanel } from './PhaseConfigPanel';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type {
  TaskId,
  TaskPhaseDoc,
  RemediationCycleDoc,
  RemediationTrigger,
} from '@/types';
import { REMEDIATION_TRIGGER_NAMES } from '@/types';

// Format duration in human readable form
const formatDuration = (startedAt?: number, completedAt?: number): string => {
  if (!startedAt) return '-';
  const end = completedAt || Date.now();
  const diff = end - startedAt;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

// Format cost
const formatCost = (cost?: number): string => {
  if (cost === undefined || cost === null) return '-';
  return `$${cost.toFixed(4)}`;
};

interface RemediationCycleCardProps {
  cycle: RemediationCycleDoc;
  isCurrentCycle: boolean;
}

function RemediationCycleCard({ cycle, isCurrentCycle }: RemediationCycleCardProps) {
  const [isOpen, setIsOpen] = useState(isCurrentCycle);

  const statusColors: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    in_progress: 'bg-primary/10 text-primary',
    completed: 'bg-success/10 text-success',
    failed: 'bg-destructive/10 text-destructive',
    skipped: 'bg-muted text-muted-foreground',
  };

  const statusIcons: Record<string, React.ReactNode> = {
    pending: <Clock size={14} />,
    in_progress: <Loader2 size={14} className="animate-spin" />,
    completed: <CheckCircle2 size={14} />,
    failed: <AlertCircle size={14} />,
    skipped: <Clock size={14} />,
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={`border rounded-lg overflow-hidden ${isCurrentCycle ? 'border-primary' : 'border-border'}`}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-4 bg-surface hover:bg-surface-elevated/50 transition-colors">
            <div className="flex items-center gap-3">
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span className="font-medium text-foreground">
                Cycle {cycle.cycleNumber}
              </span>
              {isCurrentCycle && (
                <Badge variant="default" className="text-xs">Current</Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {cycle.triggeredBy === 'ai_review' ? (
                  <Bot size={12} />
                ) : (
                  <User size={12} />
                )}
                <span>{REMEDIATION_TRIGGER_NAMES[cycle.triggeredBy]}</span>
              </div>
              <Badge className={`${statusColors[cycle.status]} uppercase text-xs`}>
                <span className="mr-1">{statusIcons[cycle.status]}</span>
                {cycle.status.replace('_', ' ')}
              </Badge>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-4 border-t border-border space-y-4">
            {cycle.feedback && (
              <div>
                <label className="text-xs text-muted-foreground uppercase font-semibold flex items-center gap-1.5 mb-2">
                  <MessageSquare size={12} /> Human Feedback
                </label>
                <div className="bg-background border border-border rounded-lg p-3">
                  <p className="text-sm text-foreground">{cycle.feedback}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-muted-foreground uppercase font-semibold">Duration</label>
                <p className="text-sm text-foreground mt-1">
                  {formatDuration(cycle.startedAt, cycle.completedAt)}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase font-semibold">Cost</label>
                <p className="text-sm text-foreground mt-1">
                  {formatCost(cycle.totalCostUsd)}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase font-semibold">Turns</label>
                <p className="text-sm text-foreground mt-1">
                  {cycle.numTurns ?? '-'}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase font-semibold">Model</label>
                <p className="text-sm text-foreground mt-1 truncate">
                  {cycle.model || '-'}
                </p>
              </div>
            </div>

            {cycle.error && (
              <div>
                <label className="text-xs text-destructive uppercase font-semibold mb-2 block">Error</label>
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                  <pre className="text-xs font-mono text-destructive whitespace-pre-wrap">
                    {cycle.error}
                  </pre>
                </div>
              </div>
            )}

            {cycle.result && (
              <div>
                <label className="text-xs text-muted-foreground uppercase font-semibold mb-2 block">Agent Output</label>
                <div className="bg-background border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
                  <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                    {cycle.result}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface RemediationTabProps {
  taskId: TaskId;
  remediationPhase: TaskPhaseDoc | null;
}

export function RemediationTab({
  taskId,
  remediationPhase,
}: RemediationTabProps) {
  const toast = useToast();
  const [showConfig, setShowConfig] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Fetch remediation cycles
  const cycles = useQuery(api.remediationCycles.listByTask, { taskId }) ?? [];
  const summary = useQuery(api.remediationCycles.getSummary, { taskId });

  const startPhase = useMutation(api.taskPhases.startPhase);

  const status = remediationPhase?.status || 'pending';
  const isPending = status === 'pending';
  const isInProgress = status === 'in_progress';
  const isCompleted = status === 'completed' || status === 'skipped';
  const currentCycleNumber = remediationPhase?.currentRemediationCycle || 0;
  const triggeredBy = remediationPhase?.remediationTriggeredBy;

  const handleStartRemediation = async () => {
    setIsStarting(true);
    try {
      await startPhase({
        taskId,
        phase: 'remediation',
      });
      toast.success('Remediation started', 'The remediation agent has begun fixing issues');
    } catch (error) {
      toast.error('Failed to start', error instanceof Error ? error.message : 'Failed to start remediation');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="space-y-8">
      <PhaseStatusHeader
        phase="remediation"
        phaseRecord={remediationPhase}
        onViewConfig={() => setShowConfig(true)}
      />

      {/* Summary Stats */}
      {summary && (
        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface border border-border rounded-lg p-4">
              <label className="text-xs text-muted-foreground uppercase font-semibold">Total Cycles</label>
              <p className="text-2xl font-bold text-foreground mt-1">{summary.totalCycles}</p>
            </div>
            <div className="bg-surface border border-border rounded-lg p-4">
              <label className="text-xs text-muted-foreground uppercase font-semibold">Max Cycles</label>
              <p className="text-2xl font-bold text-foreground mt-1">{summary.maxCycles}</p>
            </div>
            <div className="bg-surface border border-border rounded-lg p-4">
              <label className="text-xs text-muted-foreground uppercase font-semibold">Total Cost</label>
              <p className="text-2xl font-bold text-foreground mt-1">{formatCost(summary.totalCostUsd)}</p>
            </div>
            <div className="bg-surface border border-border rounded-lg p-4">
              <label className="text-xs text-muted-foreground uppercase font-semibold">Cycles Left</label>
              <p className={`text-2xl font-bold mt-1 ${summary.cyclesRemaining === 0 ? 'text-destructive' : 'text-foreground'}`}>
                {summary.cyclesRemaining}
              </p>
            </div>
          </div>
        </section>
      )}

      {isPending && cycles.length === 0 && (
        <section>
          <div className="bg-surface border border-border rounded-lg p-6 text-center">
            <Wrench size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
            <h4 className="text-lg font-medium text-foreground mb-2">
              No Remediation Required Yet
            </h4>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Remediation will be triggered automatically if the AI Review or Human Review finds issues
              that need to be fixed. You can also manually start remediation if needed.
            </p>
          </div>
        </section>
      )}

      {isPending && cycles.length > 0 && (
        <section>
          <div className="bg-surface border border-border rounded-lg p-6 text-center">
            <Wrench size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
            <h4 className="text-lg font-medium text-foreground mb-2">
              Ready for Remediation
            </h4>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              {triggeredBy === 'human_review'
                ? 'Human review has requested changes. Start the remediation agent to address the feedback.'
                : 'AI review has found issues. Start the remediation agent to fix them.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={handleStartRemediation} disabled={isStarting}>
                {isStarting ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play size={16} className="mr-2" />
                    Start Remediation
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setShowConfig(true)}>
                <Settings2 size={16} className="mr-2" />
                Configure
              </Button>
            </div>
          </div>
        </section>
      )}

      {isInProgress && (
        <section>
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Loader2 size={24} className="animate-spin text-primary" />
              <span className="text-lg font-medium text-foreground">
                Remediation Cycle {currentCycleNumber} in Progress
              </span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              The agent is fixing the issues found during review. Once complete, it will return to AI Review for validation.
            </p>
          </div>
        </section>
      )}

      {isCompleted && cycles.length === 0 && (
        <section>
          <div className="bg-success/5 border border-success/20 rounded-lg p-6 text-center">
            <CheckCircle2 size={48} className="mx-auto mb-4 text-success" />
            <h4 className="text-lg font-medium text-foreground mb-2">
              No Remediation Needed
            </h4>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              The review process completed without requiring any remediation cycles.
            </p>
          </div>
        </section>
      )}

      {/* Remediation Cycles History */}
      {cycles.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
            <Wrench size={16} className="mr-2" /> Remediation Cycles ({cycles.length})
          </h3>
          <div className="space-y-3">
            {cycles.map((cycle) => (
              <RemediationCycleCard
                key={cycle._id}
                cycle={cycle as RemediationCycleDoc}
                isCurrentCycle={cycle.cycleNumber === currentCycleNumber && isInProgress}
              />
            ))}
          </div>
        </section>
      )}

      <PhaseConfigPanel
        taskId={taskId}
        phase="remediation"
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        readOnly={!isPending}
      />
    </div>
  );
}
