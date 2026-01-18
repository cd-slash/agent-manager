import { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (project: { name: string; description: string }) => void;
}

export function NewProjectModal({
  isOpen,
  onClose,
  onCreate,
}: NewProjectModalProps) {
  const [project, setProject] = useState({ name: '', description: '' });

  const handleSubmit = () => {
    onCreate(project);
    setProject({ name: '', description: '' });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div className="p-page">
          <DialogHeader className="mb-page text-center">
            <div className="flex justify-center mb-card">
              <div className="inline-flex items-center justify-center p-component bg-primary/10 rounded-xl">
                <Sparkles className="text-primary w-8 h-8" />
              </div>
            </div>
            <DialogTitle className="text-3xl">Create New Project</DialogTitle>
            <DialogDescription>
              Create a new project to organize your tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-section">
            <div className="space-y-item">
              <Label>Project Name</Label>
              <Input
                value={project.name}
                onChange={(e) =>
                  setProject({ ...project, name: e.target.value })
                }
                placeholder="e.g., My Awesome SaaS"
              />
            </div>
            <div className="space-y-item">
              <Label>Description</Label>
              <Textarea
                value={project.description}
                onChange={(e) =>
                  setProject({ ...project, description: e.target.value })
                }
                className="h-32 resize-none"
                placeholder="Describe features, tech stack, and goals..."
              />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!project.name || !project.description}
              className="w-full py-4"
              size="lg"
            >
              <span>Create Project</span>
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
