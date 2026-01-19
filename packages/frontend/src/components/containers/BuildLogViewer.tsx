import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuildLogViewerProps {
  logs?: string;
  error?: string;
  phase: string;
  autoScroll?: boolean;
}

export function BuildLogViewer({
  logs,
  error,
  phase,
  autoScroll = true,
}: BuildLogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const hasContent = logs || error;

  return (
    <div className="h-full flex flex-col bg-background border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText size={14} />
          <span className="font-medium">Build Logs</span>
          <span className="text-xs font-mono bg-background px-2 py-0.5 rounded border border-border">
            {phase}
          </span>
        </div>
      </div>

      {/* Log content */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 min-h-full">
          {!hasContent ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <FileText size={24} className="mb-2 opacity-50" />
              <p className="text-sm">No logs available for this phase</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Error message if present */}
              {error && (
                <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-300">Error</p>
                      <p className="text-sm text-red-200/80 mt-1 font-mono whitespace-pre-wrap break-all">
                        {error}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Log output */}
              {logs && (
                <pre className="text-sm font-mono text-foreground/90 whitespace-pre-wrap break-all leading-relaxed">
                  {logs.split('\n').map((line, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'py-0.5 px-2 -mx-2 rounded hover:bg-surface-elevated/30',
                        // Highlight error lines
                        (line.toLowerCase().includes('error') ||
                          line.toLowerCase().includes('failed') ||
                          line.toLowerCase().includes('fatal')) &&
                          'text-red-400 bg-red-950/20',
                        // Highlight warning lines
                        (line.toLowerCase().includes('warn') ||
                          line.toLowerCase().includes('warning')) &&
                          'text-amber-400 bg-amber-950/20',
                        // Highlight success lines
                        (line.toLowerCase().includes('success') ||
                          line.toLowerCase().includes('complete') ||
                          line.toLowerCase().includes('done')) &&
                          'text-green-400'
                      )}
                    >
                      <span className="text-muted-foreground/50 select-none mr-3 inline-block w-8 text-right text-xs">
                        {idx + 1}
                      </span>
                      {line || ' '}
                    </div>
                  ))}
                </pre>
              )}

              {/* Auto-scroll anchor */}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
