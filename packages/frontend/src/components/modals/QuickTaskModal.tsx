import { useState, useEffect, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@agent-manager/convex/api';
import { Plus, FileStack } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { Project, TaskPhase } from '@/types';
import { PHASE_DISPLAY_NAMES } from '@/types';

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

  // Fetch available templates
  const templates = useQuery(api.taskTemplates.list) ?? [];
  const defaultTemplate = templates.find(t => t.isDefault);

  // Get the selected template for displaying phases
  const selectedTemplate = useMemo(() => {
    if (!templateId) return defaultTemplate;
    return templates.find(t => String(t._id) === templateId);
  }, [templateId, templates, defaultTemplate]);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setTemplateId('');
      const firstProject = projects[0];
      if (firstProject) {
        setProjectId(String(firstProject.id));
      }
    }
  }, [isOpen, projects]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
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
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {selectedTemplate.description}
                </p>
                <div className="flex flex-wrap gap-1">
                  {(selectedTemplate.phases as TaskPhase[]).map((phase, index) => (
                    <div key={phase} className="flex items-center">
                      <Badge variant="outline" className="text-[10px]">
                        {PHASE_DISPLAY_NAMES[phase]}
                      </Badge>
                      {index < selectedTemplate.phases.length - 1 && (
                        <span className="text-muted-foreground mx-0.5 text-xs">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

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
