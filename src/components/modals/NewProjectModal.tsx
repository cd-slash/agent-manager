import { useState, useEffect } from 'react';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Circle,
  Cpu,
  X,
} from 'lucide-react';
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

const analysisSteps = [
  'Parsing...',
  'Identifying features...',
  'Breaking down requirements...',
  'Generating tasks...',
  'Finalizing...',
];

export function NewProjectModal({
  isOpen,
  onClose,
  onCreate,
}: NewProjectModalProps) {
  const [step, setStep] = useState<'input' | 'analyzing'>('input');
  const [project, setProject] = useState({ name: '', description: '' });
  const [analysisStep, setAnalysisStep] = useState(0);

  useEffect(() => {
    if (step === 'analyzing') {
      if (analysisStep < analysisSteps.length) {
        const timer = setTimeout(() => setAnalysisStep((s) => s + 1), 800);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => {
          onCreate(project);
          setProject({ name: '', description: '' });
          setStep('input');
          setAnalysisStep(0);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [step, analysisStep, onCreate, project]);

  const handleOpenChange = (open: boolean) => {
    if (!open && step === 'input') {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        {step === 'input' ? (
          <div className="p-8">
            <DialogHeader className="mb-8 text-center">
              <div className="flex justify-center mb-4">
                <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-xl">
                  <Sparkles className="text-primary w-8 h-8" />
                </div>
              </div>
              <DialogTitle className="text-3xl">Create New Project</DialogTitle>
              <DialogDescription>
                Describe your idea to generate an AI-powered roadmap.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input
                  value={project.name}
                  onChange={(e) =>
                    setProject({ ...project, name: e.target.value })
                  }
                  placeholder="e.g., My Awesome SaaS"
                />
              </div>
              <div className="space-y-2">
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
                onClick={() => setStep('analyzing')}
                disabled={!project.name || !project.description}
                className="w-full py-4"
                size="lg"
              >
                <span>Generate Plan</span>
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-12 flex flex-col items-center justify-center min-h-[500px]">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-primary blur-xl opacity-20 animate-pulse rounded-full"></div>
              <Cpu size={64} className="text-primary relative z-10" />
            </div>
            <h2 className="text-2xl font-bold text-center mb-6 text-foreground">
              Analyzing Project
            </h2>
            <div className="space-y-3 w-full max-w-md">
              {analysisSteps.map((s, i) => (
                <div
                  key={i}
                  className={`flex items-center space-x-3 transition-all duration-500 ${
                    i > analysisStep
                      ? 'opacity-0 translate-y-2'
                      : 'opacity-100 translate-y-0'
                  }`}
                >
                  {i < analysisStep ? (
                    <CheckCircle2 className="text-success w-5 h-5" />
                  ) : i === analysisStep ? (
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Circle className="text-muted w-5 h-5" />
                  )}
                  <span
                    className={`text-sm ${
                      i === analysisStep
                        ? 'text-primary font-medium'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {s}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
