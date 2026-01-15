export interface ChatMessage {
  id: number;
  sender: 'ai' | 'user';
  text: string;
  time: string;
}

export interface HistoryEvent {
  id: number;
  action: string;
  user: string;
  time: string;
}

export interface AcceptanceCriteria {
  id: number;
  text: string;
  done: boolean;
}

export interface Test {
  id: number;
  name: string;
  status: 'passed' | 'pending' | 'failed';
}

export interface Task {
  id: number;
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
  dependencies: number[];
}

export interface Project {
  id: number;
  name: string;
  description: string;
  tasks: Task[];
  projectChatHistory?: ChatMessage[];
  plan?: string;
}

export interface Server {
  id: number;
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
