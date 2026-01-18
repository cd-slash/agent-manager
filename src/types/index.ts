// Convex types - these will be available after running `bunx convex dev`
// Import from the generated data model when available
// import { Id, Doc } from "../../convex/_generated/dataModel";

// Placeholder types until Convex is deployed
// Replace these with actual imports from convex/_generated/dataModel after setup
type Id<T extends string> = string & { __tableName: T };
type Doc<T extends string> = { _id: Id<T>; _creationTime: number } & Record<string, unknown>;

// Re-export Convex document types for convenience
export type ProjectDoc = Doc<"projects"> & {
  name: string;
  description: string;
  plan?: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type TaskDoc = Doc<"tasks"> & {
  projectId: Id<"projects">;
  title: string;
  description: string;
  prompt?: string;
  category: "backlog" | "todo" | "in-progress" | "done";
  tag: string;
  complexity: string;
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type AcceptanceCriteriaDoc = Doc<"acceptanceCriteria"> & {
  taskId: Id<"tasks">;
  text: string;
  done: boolean;
  order: number;
};

export type TestDoc = Doc<"tests"> & {
  taskId: Id<"tasks">;
  name: string;
  status: "passed" | "pending" | "failed";
  output?: string;
  duration?: number;
  runAt?: number;
};

export type ChatMessageDoc = Doc<"chatMessages"> & {
  projectId?: Id<"projects">;
  taskId?: Id<"tasks">;
  sender: "ai" | "user";
  text: string;
  createdAt: number;
};

export type HistoryEventDoc = Doc<"historyEvents"> & {
  projectId?: Id<"projects">;
  taskId?: Id<"tasks">;
  action: string;
  user: string;
  metadata?: unknown;
  createdAt: number;
};

export type PullRequestDoc = Doc<"pullRequests"> & {
  taskId: Id<"tasks">;
  prNumber: number;
  title: string;
  description?: string;
  branch: string;
  baseBranch: string;
  status: "draft" | "open" | "review_requested" | "changes_requested" | "approved" | "merged" | "closed";
  url?: string;
  createdAt: number;
  updatedAt: number;
};

export type PrCommentDoc = Doc<"prComments"> & {
  pullRequestId: Id<"pullRequests">;
  author: string;
  body: string;
  filePath?: string;
  lineNumber?: number;
  resolved: boolean;
  createdAt: number;
};

export type PrIssueDoc = Doc<"prIssues"> & {
  pullRequestId: Id<"pullRequests">;
  severity: "error" | "warning" | "info";
  title: string;
  description: string;
  filePath: string;
  lineNumber?: number;
  suggestion?: string;
  resolved: boolean;
  createdAt: number;
};

export type PrCheckDoc = Doc<"prChecks"> & {
  pullRequestId: Id<"pullRequests">;
  name: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  url?: string;
  output?: string;
  startedAt?: number;
  completedAt?: number;
};

export type ServerDoc = Doc<"servers"> & {
  name: string;
  ip: string;
  region: string;
  status: "online" | "maintenance" | "offline";
  cpu: number;
  mem: number;
  createdAt: number;
  updatedAt: number;
};

export type ContainerDoc = Doc<"containers"> & {
  serverId: Id<"servers">;
  containerId: string;
  name: string;
  image: string;
  status: "running" | "stopped" | "restarting" | "paused" | "exited";
  port: string;
  createdAt: number;
  updatedAt: number;
};

export type ServerMetricDoc = Doc<"serverMetrics"> & {
  serverId: Id<"servers">;
  cpu: number;
  mem: number;
  networkIn?: number;
  networkOut?: number;
  diskUsage?: number;
  timestamp: number;
};

export type WebhookEventDoc = Doc<"webhookEvents"> & {
  source: "github" | "cicd" | "agent";
  eventType: string;
  payload: unknown;
  status: "pending" | "processing" | "processed" | "failed";
  errorMessage?: string;
  processedAt?: number;
  retryCount: number;
  createdAt: number;
};

export type AgentJobDoc = Doc<"agentJobs"> & {
  taskId?: Id<"tasks">;
  pullRequestId?: Id<"pullRequests">;
  type: "chat_response" | "task_analysis" | "code_review" | "auto_fix";
  status: "pending" | "running" | "completed" | "failed";
  input?: unknown;
  output?: unknown;
  errorMessage?: string;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
};

// Legacy interfaces for backward compatibility during migration
// These can be removed once all components are updated to use Convex types

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
}

export interface HistoryEvent {
  id: string;
  action: string;
  user: string;
  time: string;
}

export interface AcceptanceCriteria {
  id: string;
  text: string;
  done: boolean;
}

export interface Test {
  id: string;
  name: string;
  status: 'passed' | 'pending' | 'failed';
}

export interface Task {
  id: string;
  title: string;
  category: 'backlog' | 'todo' | 'in-progress' | 'done';
  tag: string;
  complexity: string;
  description: string;
  prompt?: string;
  acceptanceCriteria?: AcceptanceCriteria[];
  tests?: Test[];
  chatHistory?: ChatMessage[];
  history?: HistoryEvent[];
  prCreated: boolean;
  prNumber?: number;
  prStatus?: string;
  dependencies: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  tasks: Task[];
  projectChatHistory?: ChatMessage[];
  plan?: string;
}

export interface Server {
  id: string;
  name: string;
  ip: string;
  region: string;
  status: 'online' | 'maintenance' | 'offline';
  cpu: number;
  mem: number;
}

export interface Container {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped';
  port: string;
  server: string;
}

// Extended types that include related data (from Convex queries)
export interface TaskWithDetails extends TaskDoc {
  acceptanceCriteria: AcceptanceCriteriaDoc[];
  tests: TestDoc[];
  chatHistory: ChatMessageDoc[];
  history: HistoryEventDoc[];
  dependencies: TaskDoc[];
  blockedBy: TaskDoc[];
  pullRequest: PullRequestDoc | null;
}

export interface ProjectWithStats extends ProjectDoc {
  stats: {
    total: number;
    backlog: number;
    todo: number;
    inProgress: number;
    done: number;
  };
}

export interface TaskWithProject extends TaskDoc {
  project: ProjectDoc | null;
}

export interface ContainerWithServer extends ContainerDoc {
  serverName?: string;
}

export interface PullRequestWithDetails extends PullRequestDoc {
  comments: PrCommentDoc[];
  issues: PrIssueDoc[];
  checks: PrCheckDoc[];
}

export interface ServerWithContainers extends ServerDoc {
  containers: ContainerDoc[];
}

// Type helpers for Convex IDs
export type ProjectId = Id<"projects">;
export type TaskId = Id<"tasks">;
export type AcceptanceCriteriaId = Id<"acceptanceCriteria">;
export type TestId = Id<"tests">;
export type ChatMessageId = Id<"chatMessages">;
export type HistoryEventId = Id<"historyEvents">;
export type PullRequestId = Id<"pullRequests">;
export type PrCommentId = Id<"prComments">;
export type PrIssueId = Id<"prIssues">;
export type PrCheckId = Id<"prChecks">;
export type ServerId = Id<"servers">;
export type ContainerId = Id<"containers">;
export type ServerMetricId = Id<"serverMetrics">;
export type WebhookEventId = Id<"webhookEvents">;
export type AgentJobId = Id<"agentJobs">;
