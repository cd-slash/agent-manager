import { useState } from 'react';
import { MessageSquare, Send, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const [selectedModel, setSelectedModel] = useState('Gemini');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessage(chatInput);
    setChatInput('');
  };

  return (
    <div className="w-80 bg-surface flex flex-col border-l border-border h-full">
      <div className="p-4 border-b border-border flex justify-between items-center bg-surface/50">
        <h3 className="text-sm font-semibold text-foreground flex items-center">
          <MessageSquare size={16} className="mr-2 text-feature-blue" />
          Agent Chat
        </h3>
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger className="w-24 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Gemini">Gemini</SelectItem>
            <SelectItem value="Opus">Opus</SelectItem>
            <SelectItem value="GPT-4">GPT-4</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                  'max-w-[85%] rounded-2xl p-3 text-sm shadow-sm',
                  msg.sender === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-none'
                    : 'bg-surface-elevated text-foreground rounded-bl-none border border-border'
                )}
              >
                {msg.text}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 px-1">
                {msg.time}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border bg-surface">
        <form onSubmit={handleSend} className="relative">
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask agent..."
            className="pr-10"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1 text-muted-foreground hover:text-foreground"
          >
            <Send size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
