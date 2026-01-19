import { useState } from "react";
import { Box, ArrowRight, Loader2 } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@agent-manager/convex/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CreateContainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    repo: string;
    branch: string;
    name?: string;
    server: string;
  }) => Promise<void>;
}

export function CreateContainerModal({
  isOpen,
  onClose,
  onCreate,
}: CreateContainerModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    repo: "",
    branch: "main",
    name: "",
    server: "localhost",
  });

  // Fetch servers from Convex for the dropdown
  const servers = useQuery(api.servers.list) ?? [];

  const handleSubmit = async () => {
    if (!form.repo) {
      setError("Repository is required");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await onCreate({
        repo: form.repo,
        branch: form.branch || "main",
        name: form.name || undefined,
        server: form.server,
      });
      // Reset form on success
      setForm({ repo: "", branch: "main", name: "", server: "localhost" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create container");
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isCreating) {
      setError(null);
      onClose();
    }
  };

  // Build server options (always include localhost, plus any registered servers)
  const serverOptions = [
    { value: "localhost", label: "Local (localhost)" },
    ...servers
      .filter((s) => s.name !== "localhost")
      .map((s) => ({
        value: s.tailscaleHostname || s.name,
        label: `${s.name} (${s.region})`,
      })),
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="p-page">
          <DialogHeader className="mb-page text-center">
            <div className="flex justify-center mb-card">
              <div className="inline-flex items-center justify-center p-component bg-primary/10 rounded-xl">
                <Box className="text-primary w-8 h-8" />
              </div>
            </div>
            <DialogTitle className="text-2xl">Create Container</DialogTitle>
            <DialogDescription>
              Create a new agent container from a GitHub repository.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-section">
            {/* Server Selection */}
            <div className="space-y-item">
              <Label>Target Server</Label>
              <Select
                value={form.server}
                onValueChange={(value) => setForm({ ...form, server: value })}
                disabled={isCreating}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a server" />
                </SelectTrigger>
                <SelectContent>
                  {serverOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Repository */}
            <div className="space-y-item">
              <Label>Repository</Label>
              <Input
                value={form.repo}
                onChange={(e) => setForm({ ...form, repo: e.target.value })}
                placeholder="owner/repo"
                disabled={isCreating}
              />
              <p className="text-xs text-muted-foreground">
                GitHub repository in owner/repo format
              </p>
            </div>

            {/* Branch */}
            <div className="space-y-item">
              <Label>Branch</Label>
              <Input
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
                placeholder="main"
                disabled={isCreating}
              />
            </div>

            {/* Container Name (optional) */}
            <div className="space-y-item">
              <Label>
                Container Name{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Auto-generated (e.g., tar-bat-sag)"
                disabled={isCreating}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-component bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={!form.repo || isCreating}
              className="w-full py-4"
              size="lg"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  <span>Creating Container...</span>
                </>
              ) : (
                <>
                  <span>Create Container</span>
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
