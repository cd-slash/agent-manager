import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types';

export interface AgentConfig {
  name: string;
  defaultModel: string;
  availableModels: string[];
  placeholder?: string;
}

interface FloatingAgentChatProps {
  chatHistory?: ChatMessage[];
  onSendMessage: (text: string) => void;
  agent: AgentConfig;
  className?: string;
}

export function FloatingAgentChat({
  chatHistory,
  onSendMessage,
  agent,
  className,
}: FloatingAgentChatProps) {
  const [chatInput, setChatInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(agent.defaultModel);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessage(chatInput);
    setChatInput('');
  };

  return (
    <div className={cn('w-80 shrink-0 bg-surface border-l border-border flex flex-col', className)}>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex justify-between items-center bg-surface/50 shrink-0">
        <h3 className="text-sm font-semibold text-foreground flex items-center">
          <MessageSquare size={14} className="mr-2 text-feature-blue" />
          {agent.name}
        </h3>
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger className="w-20 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agent.availableModels.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Chat messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        <div className="space-y-3">
          {(!chatHistory || chatHistory.length === 0) && (
            <div className="text-center text-muted-foreground text-sm py-12">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
              <p>No messages yet.</p>
              <p className="text-xs mt-1">Start a conversation with {agent.name}</p>
            </div>
          )}
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
                  'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                  msg.sender === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-surface-elevated text-foreground rounded-bl-sm border border-border'
                )}
              >
                {msg.text}
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                {msg.time}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-border bg-surface shrink-0">
        <form onSubmit={handleSend} className="relative">
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={agent.placeholder || `Ask ${agent.name}...`}
            className="pr-10 h-9 text-sm"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <Send size={14} />
          </Button>
        </form>
      </div>
    </div>
  );
}
