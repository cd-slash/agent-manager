import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types';

interface AgentChatPanelProps {
  chatHistory?: ChatMessage[];
  onSendMessage: (text: string) => void;
}

export function AgentChatPanel({
  chatHistory,
  onSendMessage,
}: AgentChatPanelProps) {
  const [chatInput, setChatInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('Opus');
  const [mode, setMode] = useState<'plan' | 'edit'>('plan');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [chatInput]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessage(chatInput);
    setChatInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
        <MessageSquare size={16} className="mr-2" />
        Agent Chat
      </h3>
      <div className="bg-surface border border-border rounded-xl flex flex-col flex-1 overflow-hidden">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {chatHistory?.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex flex-col',
                msg.sender === 'user' ? 'items-end' : 'items-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl p-component text-sm shadow-sm',
                  msg.sender === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-none'
                    : 'bg-surface-elevated text-foreground rounded-bl-none border border-border'
                )}
              >
                {msg.text}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 px-compact">
                {msg.time}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border space-y-3">
        <form onSubmit={handleSend} className="relative">
          <textarea
            ref={textareaRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Ask agent..."
            rows={1}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 bottom-2 text-muted-foreground hover:text-foreground"
          >
            <Send size={16} />
          </Button>
        </form>
        <div className="flex items-center justify-between">
          <div className="flex items-center bg-background rounded-md border border-border p-[3px] h-7">
            <button
              type="button"
              onClick={() => setMode('plan')}
              className={cn(
                'px-2.5 h-5 text-xs font-medium rounded transition-colors flex items-center',
                mode === 'plan'
                  ? 'bg-surface-elevated text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Plan
            </button>
            <button
              type="button"
              onClick={() => setMode('edit')}
              className={cn(
                'px-2.5 h-5 text-xs font-medium rounded transition-colors flex items-center',
                mode === 'edit'
                  ? 'bg-surface-elevated text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Edit
            </button>
          </div>
          <div className="flex items-center bg-background rounded-md border border-border p-[3px] h-7">
            <button
              type="button"
              onClick={() => setSelectedModel('Opus')}
              className={cn(
                'px-2.5 h-5 text-xs font-medium rounded transition-colors flex items-center',
                selectedModel === 'Opus'
                  ? 'bg-surface-elevated text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Opus
            </button>
            <button
              type="button"
              onClick={() => setSelectedModel('Gemini')}
              className={cn(
                'px-2.5 h-5 text-xs font-medium rounded transition-colors flex items-center',
                selectedModel === 'Gemini'
                  ? 'bg-surface-elevated text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Gemini
            </button>
            <button
              type="button"
              onClick={() => setSelectedModel('GPT-5')}
              className={cn(
                'px-2.5 h-5 text-xs font-medium rounded transition-colors flex items-center',
                selectedModel === 'GPT-5'
                  ? 'bg-surface-elevated text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              GPT-5
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
