import { useState, useEffect, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import { Plus, ChevronDown, ChevronRight, Settings2, FileStack } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { Project, TaskPhase, TaskTemplateDoc } from '@/types';
import { PHASE_DISPLAY_NAMES } from '@/types';

// Available models
const MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
];

interface PhaseOverride {
  enabled: boolean;
  model?: string;
}

type PhaseOverrides = Partial<Record<TaskPhase, PhaseOverride>>;

interface QuickTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  onCreate: (projectId: string, title: string, templateId?: string) => void;
}

export function QuickTaskModal({
  isOpen,
  onClose,
  projects,
  onCreate,
}: QuickTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [phaseOverrides, setPhaseOverrides] = useState<PhaseOverrides>({});

  // Fetch available templates
  const templates = useQuery(api.taskTemplates.list) ?? [];
  const defaultTemplate = templates.find(t => t.isDefault);

  // Get phases for the selected template
  const selectedTemplate = useMemo(() => {
    if (!templateId) return defaultTemplate;
    return templates.find(t => String(t._id) === templateId);
  }, [templateId, templates, defaultTemplate]);

  // Agent phases (excludes requirements which has no agent)
  const templateAgentPhases = useMemo(() => {
    if (!selectedTemplate) return [];
    return selectedTemplate.phases.filter(p => p !== 'requirements') as TaskPhase[];
  }, [selectedTemplate]);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setTemplateId('');
      setShowAdvanced(false);
      setPhaseOverrides({});
      const firstProject = projects[0];
      if (firstProject) {
        setProjectId(String(firstProject.id));
      }
    }
  }, [isOpen, projects]);

  const handlePhaseToggle = (phase: TaskPhase, enabled: boolean) => {
    setPhaseOverrides((prev) => ({
      ...prev,
      [phase]: { ...prev[phase], enabled },
    }));
  };

  const handlePhaseModelChange = (phase: TaskPhase, model: string) => {
    setPhaseOverrides((prev) => ({
      ...prev,
      [phase]: { ...prev[phase], model, enabled: prev[phase]?.enabled ?? true },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    // TODO: Pass phaseOverrides and description to onCreate when backend supports it
    onCreate(projectId, title, templateId || undefined);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Plus size={20} className="mr-2 text-primary" />
            Create Task
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Task Title</Label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
            />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details about the task..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <FileStack size={14} />
              Task Template
            </Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder={defaultTemplate ? `${defaultTemplate.name} (Default)` : 'Select a template'} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={String(template._id)} value={String(template._id)}>
                    <div className="flex items-center gap-2">
                      <span>{template.name}</span>
                      {template.isDefault && (
                        <span className="text-xs text-muted-foreground">(Default)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplate && (
              <p className="text-xs text-muted-foreground">
                {selectedTemplate.description}
              </p>
            )}
          </div>

          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start text-muted-foreground hover:text-foreground"
              >
                {showAdvanced ? (
                  <ChevronDown size={16} className="mr-2" />
                ) : (
                  <ChevronRight size={16} className="mr-2" />
                )}
                <Settings2 size={16} className="mr-2" />
                Advanced Phase Settings
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Override the default model for specific phases. These settings will only apply to this task.
                </p>
                {templateAgentPhases.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    Select a template to see configurable phases.
                  </p>
                ) : (
                  templateAgentPhases.map((phase) => (
                    <div
                      key={phase}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={phaseOverrides[phase]?.enabled ?? true}
                          onCheckedChange={(checked) => handlePhaseToggle(phase, checked)}
                        />
                        <span className="text-sm font-medium">
                          {PHASE_DISPLAY_NAMES[phase]}
                        </span>
                      </div>
                      <Select
                        value={phaseOverrides[phase]?.model || ''}
                        onValueChange={(value) => handlePhaseModelChange(phase, value)}
                      >
                        <SelectTrigger className="w-40 h-8">
                          <SelectValue placeholder="Default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Default</SelectItem>
                          {MODELS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Create Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
