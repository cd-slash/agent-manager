import { useState } from 'react';
import {
  Layout,
  Link as LinkIcon,
  Terminal,
  CheckSquare,
  Activity,
  CheckCircle2,
  GitPullRequest,
  GitMerge,
  Bot,
  UserCheck,
  History,
  User,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Play,
  AlertTriangle,
  ThumbsUp,
  MessageSquare,
  Globe,
  XCircle,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgentChatPanel } from '@/components/chat/AgentChatPanel';
import type { Task, Project } from '@/types';

interface TaskDetailViewProps {
  task: Task;
  project?: Project;
  onBack: () => void;
  onUpdate: (task: Task) => void;
}

// Mock Data
const mockDiffs = [
  {
    filename: 'src/utils/cart.js',
    lines: [
      { line: 24, type: 'same', text: '  const calculateTotal = (items) => {' },
      {
        line: 25,
        type: 'remove',
        text: '    return items.reduce((acc, item) => acc + item.price, 0);',
      },
      {
        line: 26,
        type: 'add',
        text: '    return items.reduce((acc, item) => acc + (item.price * item.qty), 0);',
      },
      { line: 27, type: 'same', text: '  };' },
    ],
  },
  {
    filename: 'src/components/Checkout.jsx',
    lines: [
      { line: 12, type: 'same', text: '  return (' },
      {
        line: 13,
        type: 'add',
        text: '    <div className="total-price">{calculateTotal(cart)}</div>',
      },
      { line: 14, type: 'same', text: '    <button>Pay Now</button>' },
    ],
  },
];

const aiIssues = [
  {
    id: 1,
    severity: 'high',
    title: 'Potential SQL Injection',
    desc: 'Input sanitization missing on line 45.',
  },
  {
    id: 2,
    severity: 'low',
    title: 'Unused Variable',
    desc: 'Variable "tempData" is declared but never used.',
  },
];

export function TaskDetailView({
  task,
  project,
  onBack,
  onUpdate,
}: TaskDetailViewProps) {
  const [activeTab, setActiveTab] = useState('requirements');
  const [openFiles, setOpenFiles] = useState<Record<string, boolean>>({
    'src/utils/cart.js': true,
  });

  const toggleFile = (filename: string) =>
    setOpenFiles((prev) => ({ ...prev, [filename]: !prev[filename] }));

  const handleCreatePR = () => {
    const updatedTask = {
      ...task,
      prCreated: true,
      prNumber: Math.floor(Math.random() * 1000) + 4000,
      prStatus: 'open',
    };
    onUpdate(updatedTask);
    setActiveTab('pr');
  };

  const handleSendMessage = (text: string) => {
    const newMessage = {
      id: Date.now(),
      sender: 'user' as const,
      text: text,
      time: 'Just now',
    };
    const updatedTask = {
      ...task,
      chatHistory: [...(task.chatHistory || []), newMessage],
    };
    onUpdate(updatedTask);
  };

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in duration-300">
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto min-w-0 border-r border-border">
          <div className="px-6 pt-6 shrink-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full justify-start">
                <TabsTrigger value="requirements">Requirements</TabsTrigger>
                <TabsTrigger value="diff" className="flex items-center">
                  <GitPullRequest size={14} className="mr-1.5" />
                  Diff
                </TabsTrigger>
                <TabsTrigger value="pr" className="flex items-center">
                  <GitMerge size={14} className="mr-1.5" />
                  Pull Request
                </TabsTrigger>
                <TabsTrigger value="ai-review" className="flex items-center">
                  <Bot size={14} className="mr-1.5" />
                  AI Review
                </TabsTrigger>
                <TabsTrigger value="human-review" className="flex items-center">
                  <UserCheck size={14} className="mr-1.5" />
                  Human Review
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center">
                  <History size={14} className="mr-1.5" />
                  History
                </TabsTrigger>
              </TabsList>

              <div className="py-6">
                <TabsContent value="requirements" className="mt-0">
                  <div className="space-y-8">
                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <Layout size={16} className="mr-2" /> Description
                      </h3>
                      <div className="bg-surface border border-border rounded-xl p-4 text-foreground leading-relaxed">
                        {task.description}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <LinkIcon size={16} className="mr-2" /> Dependencies
                      </h3>
                      <div className="bg-surface border border-border rounded-xl overflow-hidden">
                        {(!task.dependencies ||
                          task.dependencies.length === 0) && (
                          <div className="p-4 text-sm text-muted-foreground">
                            No dependencies.
                          </div>
                        )}
                        {task.dependencies?.map((depId) => {
                          const depTask = project?.tasks.find(
                            (t) => t.id === depId
                          );
                          if (!depTask) return null;
                          return (
                            <div
                              key={depId}
                              className="flex items-center justify-between p-3 border-b border-border last:border-0 hover:bg-surface-elevated/50"
                            >
                              <div className="flex items-center">
                                <div
                                  className={`w-2 h-2 rounded-full mr-3 ${
                                    depTask.category === 'done'
                                      ? 'bg-green-500'
                                      : 'bg-muted'
                                  }`}
                                ></div>
                                <span
                                  className={`text-sm ${
                                    depTask.category === 'done'
                                      ? 'text-muted-foreground line-through'
                                      : 'text-foreground'
                                  }`}
                                >
                                  {depTask.title}
                                </span>
                              </div>
                              <Badge variant="secondary" className="uppercase">
                                {depTask.category}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <Terminal size={16} className="mr-2" /> AI Prompt
                      </h3>
                      <div className="bg-surface border border-border rounded-xl p-4">
                        <code className="text-sm font-mono text-feature-blue block mb-2">
                          {task.prompt}
                        </code>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Play size={12} className="mr-1" /> Run Agent
                          </Button>
                        </div>
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <CheckSquare size={16} className="mr-2" /> Acceptance
                        Criteria
                      </h3>
                      <div className="bg-surface border border-border rounded-xl p-2">
                        {task.acceptanceCriteria?.map((criteria) => (
                          <div
                            key={criteria.id}
                            className="flex items-center p-3 hover:bg-surface-elevated/50 rounded-lg transition-colors group"
                          >
                            <div
                              className={`w-5 h-5 rounded border flex items-center justify-center mr-3 transition-colors ${
                                criteria.done
                                  ? 'bg-green-500/20 border-green-500 text-green-500'
                                  : 'border-border text-transparent hover:border-muted-foreground'
                              }`}
                            >
                              <CheckCircle2
                                size={14}
                                className={
                                  criteria.done ? 'opacity-100' : 'opacity-0'
                                }
                              />
                            </div>
                            <span
                              className={`text-sm ${
                                criteria.done
                                  ? 'text-muted-foreground line-through'
                                  : 'text-foreground'
                              }`}
                            >
                              {criteria.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
                        <Activity size={16} className="mr-2" /> Tests
                      </h3>
                      <div className="bg-surface border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-background text-muted-foreground font-medium">
                            <tr>
                              <th className="p-3">Test Name</th>
                              <th className="p-3 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {task.tests?.map((test) => (
                              <tr
                                key={test.id}
                                className="hover:bg-surface-elevated/50"
                              >
                                <td className="p-3 font-mono text-foreground">
                                  {test.name}
                                </td>
                                <td className="p-3 text-right">
                                  <Badge
                                    variant={
                                      test.status === 'passed'
                                        ? 'success'
                                        : 'warning'
                                    }
                                    className="uppercase"
                                  >
                                    {test.status}
                                  </Badge>
                                </td>
                              </tr>
                            )) || (
                              <tr>
                                <td
                                  colSpan={2}
                                  className="p-4 text-center text-muted-foreground"
                                >
                                  No tests defined
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                </TabsContent>

                <TabsContent value="diff" className="mt-0">
                  <div className="space-y-4">
                    {mockDiffs.map((file, idx) => (
                      <div
                        key={idx}
                        className="bg-background rounded-lg border border-border overflow-hidden"
                      >
                        <button
                          onClick={() => toggleFile(file.filename)}
                          className="w-full flex items-center justify-between p-3 bg-surface/50 hover:bg-surface transition-colors border-b border-border"
                        >
                          <div className="flex items-center space-x-2 text-sm font-mono text-foreground">
                            {openFiles[file.filename] ? (
                              <ChevronDown size={16} />
                            ) : (
                              <ChevronRight size={16} />
                            )}
                            <span>{file.filename}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            4 changes
                          </span>
                        </button>
                        {openFiles[file.filename] && (
                          <div className="font-mono text-sm leading-6">
                            {file.lines.map((line, i) => (
                              <div
                                key={i}
                                className={`flex ${
                                  line.type === 'add'
                                    ? 'bg-green-500/10'
                                    : line.type === 'remove'
                                      ? 'bg-red-500/10'
                                      : ''
                                }`}
                              >
                                <div className="w-10 text-muted-foreground text-right pr-3 select-none border-r border-border/50 bg-surface/30">
                                  {line.line}
                                </div>
                                <div className="w-6 text-muted-foreground text-center select-none">
                                  {line.type === 'add'
                                    ? '+'
                                    : line.type === 'remove'
                                      ? '-'
                                      : ''}
                                </div>
                                <div
                                  className={`flex-1 pr-4 whitespace-pre ${
                                    line.type === 'add'
                                      ? 'text-green-300'
                                      : line.type === 'remove'
                                        ? 'text-red-300'
                                        : 'text-muted-foreground'
                                  }`}
                                >
                                  {line.text}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="mt-4 flex justify-end">
                      {task.prCreated ? (
                        <Button
                          variant="outline"
                          onClick={() => setActiveTab('pr')}
                        >
                          <GitPullRequest size={16} className="mr-2" /> View PR
                          #{task.prNumber}
                        </Button>
                      ) : (
                        <Button onClick={handleCreatePR}>
                          <GitPullRequest size={16} className="mr-2" /> Create
                          PR
                        </Button>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="pr" className="mt-0">
                  {!task.prCreated ? (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground bg-surface/30 border border-border rounded-xl border-dashed">
                      <GitPullRequest size={48} className="mb-4 opacity-50" />
                      <p className="font-medium text-muted-foreground">
                        No Pull Request created yet.
                      </p>
                      <button
                        onClick={handleCreatePR}
                        className="mt-4 text-feature-blue hover:text-feature-blue text-sm flex items-center hover:underline"
                      >
                        Create one from changes{' '}
                        <ArrowRight size={14} className="ml-1" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="bg-surface border border-border rounded-xl p-6">
                        <div className="mb-6">
                          <div className="mb-3">
                            <span className="text-xl font-bold text-foreground">
                              #{task.prNumber} {task.title}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center">
                            <span className="font-mono bg-background border border-border px-2 py-0.5 rounded text-foreground text-xs">
                              feature/task-{String(task.id).slice(-4)}
                            </span>
                            <ArrowRight
                              size={14}
                              className="mx-2 text-muted-foreground"
                            />
                            <span className="font-mono bg-background border border-border px-2 py-0.5 rounded text-foreground text-xs">
                              main
                            </span>
                            <Badge variant="success" className="ml-3 uppercase">
                              Open
                            </Badge>
                          </div>
                        </div>
                        <div className="flex justify-start space-x-3">
                          <Button className="bg-green-600 hover:bg-green-500">
                            <GitMerge size={16} className="mr-2" /> Merge Pull
                            Request
                          </Button>
                          <Button variant="outline">
                            <XCircle size={16} className="mr-2" /> Close Pull
                            Request
                          </Button>
                        </div>
                      </div>

                      <div className="bg-surface border border-border rounded-xl overflow-hidden">
                        <div className="p-4 border-b border-border font-semibold text-foreground">
                          Checks
                        </div>
                        <div className="divide-y divide-border">
                          <div className="p-4 flex items-center justify-between hover:bg-surface-elevated/30 transition-colors">
                            <div className="flex items-center">
                              <CheckCircle2
                                size={18}
                                className="text-green-400 mr-3"
                              />
                              <span className="text-foreground">CI Build</span>
                            </div>
                            <span className="text-xs text-green-400 font-medium">
                              Passed
                            </span>
                          </div>
                          <div className="p-4 flex items-center justify-between hover:bg-surface-elevated/30 transition-colors">
                            <div className="flex items-center">
                              <Bot size={18} className="text-feature-blue mr-3" />
                              <span className="text-foreground">
                                AI Code Review
                              </span>
                            </div>
                            <span className="text-xs text-green-400 font-medium">
                              Passed
                            </span>
                          </div>
                          <div className="p-4 flex items-center justify-between hover:bg-surface-elevated/30 transition-colors">
                            <div className="flex items-center">
                              <Activity
                                size={18}
                                className="text-green-400 mr-3"
                              />
                              <span className="text-foreground">Unit Tests</span>
                            </div>
                            <span className="text-xs text-green-400 font-medium">
                              3/3 Passed
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="relative border-l border-border ml-3 space-y-6">
                        <div className="relative pl-6">
                          <div className="absolute -left-1.5 top-1.5 w-3 h-3 bg-surface-elevated border border-border rounded-full"></div>
                          <div className="text-sm text-foreground font-medium">
                            John Doe created this pull request
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Just now
                          </div>
                        </div>
                      </div>

                      <div className="bg-surface border border-border rounded-xl p-4">
                        <h4 className="text-sm font-medium text-muted-foreground mb-3">
                          Add a comment
                        </h4>
                        <div className="flex space-x-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-feature-blue text-xs font-bold shrink-0">
                            ME
                          </div>
                          <div className="flex-1">
                            <Textarea
                              className="h-24 resize-none"
                              placeholder="Leave a comment..."
                            />
                            <div className="flex justify-end mt-2">
                              <Button variant="outline" size="sm">
                                Comment
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="ai-review" className="mt-0">
                  <div className="space-y-6">
                    <div className="bg-blue-950/30 border border-blue-900/50 rounded-xl p-5 text-blue-100 flex items-start space-x-4">
                      <Bot size={24} className="mt-1 flex-shrink-0 text-feature-blue" />
                      <div>
                        <h4 className="font-semibold text-feature-blue mb-1">
                          Agent Summary
                        </h4>
                        <p className="text-sm leading-relaxed opacity-90">
                          I have analyzed the submitted code against the project
                          requirements. The implementation correctly handles the
                          new pricing logic for bulk items. However, I detected
                          a potential SQL injection vulnerability in the input
                          handling and a minor performance regression in the
                          cart calculation loop. I recommend fixing the security
                          issue before merging.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-surface p-5 rounded-xl border border-border flex flex-col items-center">
                        <div className="text-muted-foreground text-xs uppercase font-semibold mb-2">
                          Security Score
                        </div>
                        <div className="text-4xl font-bold text-green-400 mb-1">
                          A+
                        </div>
                        <div className="text-green-500/60 text-xs">
                          No vulnerabilities
                        </div>
                      </div>
                      <div className="bg-surface p-5 rounded-xl border border-border flex flex-col items-center">
                        <div className="text-muted-foreground text-xs uppercase font-semibold mb-2">
                          Performance
                        </div>
                        <div className="text-4xl font-bold text-feature-blue mb-1">
                          98
                        </div>
                        <div className="text-blue-500/60 text-xs">Optimized</div>
                      </div>
                      <div className="bg-surface p-5 rounded-xl border border-border flex flex-col items-center">
                        <div className="text-muted-foreground text-xs uppercase font-semibold mb-2">
                          Maintainability
                        </div>
                        <div className="text-4xl font-bold text-amber-400 mb-1">
                          B
                        </div>
                        <div className="text-amber-500/60 text-xs">
                          Refactor suggested
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Detected Issues
                      </h3>
                      <div className="space-y-3">
                        {aiIssues.map((issue) => (
                          <div
                            key={issue.id}
                            className="bg-surface/50 border border-border rounded-lg p-4 flex items-start"
                          >
                            <div
                              className={`mt-0.5 mr-3 flex-shrink-0 ${
                                issue.severity === 'high'
                                  ? 'text-red-400'
                                  : 'text-amber-400'
                              }`}
                            >
                              <AlertTriangle size={18} />
                            </div>
                            <div>
                              <h4 className="text-foreground font-medium text-sm">
                                {issue.title}
                              </h4>
                              <p className="text-muted-foreground text-sm mt-1">
                                {issue.desc}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="ml-auto"
                            >
                              Auto-fix
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="human-review" className="mt-0">
                  <div className="space-y-6">
                    <div className="bg-surface border border-border rounded-xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-foreground">
                          Review Status
                        </h3>
                        <Badge variant="warning" className="uppercase">
                          Pending Approval
                        </Badge>
                      </div>

                      <div className="bg-background rounded-lg border border-border p-4 mb-6 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Globe size={18} className="text-feature-blue" />
                          <span className="text-muted-foreground text-sm">
                            Deployment URL:
                          </span>
                          <a
                            href="#"
                            className="text-feature-blue text-sm hover:underline font-mono"
                          >
                            https://pr-4829.staging.app-planner.com
                          </a>
                        </div>
                        <Button variant="outline" size="sm">
                          Visit
                        </Button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border mb-6">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-feature-purple font-bold mr-3">
                            JD
                          </div>
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              John Doe
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Lead Developer
                            </div>
                          </div>
                        </div>
                        <div className="flex space-x-3">
                          <Button variant="outline">
                            <MessageSquare size={16} className="mr-2" />
                            Request Changes
                          </Button>
                          <Button className="bg-green-600 hover:bg-green-500">
                            <ThumbsUp size={16} className="mr-2" />
                            Approve
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Comments
                        </h4>
                        <div className="flex space-x-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-feature-blue text-xs font-bold shrink-0">
                            ME
                          </div>
                          <div className="flex-1">
                            <Textarea
                              className="h-24 resize-none"
                              placeholder="Leave a comment..."
                            />
                            <div className="flex justify-end mt-2">
                              <Button variant="outline" size="sm">
                                Post Comment
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                  <div className="relative border-l border-border ml-3 space-y-6">
                    {task.history?.map((event) => (
                      <div key={event.id} className="relative pl-6">
                        <div className="absolute -left-1.5 top-1.5 w-3 h-3 bg-surface-elevated border border-border rounded-full"></div>
                        <div className="text-sm text-foreground font-medium">
                          {event.action}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center space-x-2">
                          <User size={12} />
                          <span>{event.user}</span>
                          <span className="w-1 h-1 bg-muted rounded-full"></span>
                          <span>{event.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
        <AgentChatPanel
          chatHistory={task.chatHistory}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  );
}
