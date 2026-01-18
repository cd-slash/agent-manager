# Agent Manager

A real-time agent management dashboard for orchestrating AI coding agents, managing projects, tasks, pull requests, and infrastructure. Built with React 19, Bun, and Convex for a fully reactive, serverless backend.

## Features

- **Project Management**: Create and manage software projects with specifications and task breakdown
- **Task Tracking**: Kanban-style task management with dependencies, acceptance criteria, and test tracking
- **AI Agent Chat**: Conversational interface for AI agents at both project and task levels
- **Pull Request Management**: Track PRs, code reviews, issues, and CI/CD status
- **Infrastructure Monitoring**: Server and container management with real-time metrics
- **Real-time Updates**: All changes sync instantly across clients via Convex subscriptions

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | [Bun](https://bun.sh) |
| Frontend | React 19, TypeScript, Tailwind CSS |
| UI Components | [shadcn/ui](https://ui.shadcn.com) (Radix primitives) |
| Backend | [Convex](https://convex.dev) (serverless database + functions) |
| Icons | [Lucide React](https://lucide.dev) |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.3.4 or later
- A [Convex](https://convex.dev) account (free tier available)

### Installation

```bash
# Install dependencies
bun install

# Start Convex development server (in a separate terminal)
bunx convex dev

# Start the frontend development server
bun dev
```

The application will be available at `http://localhost:3000`.

### Environment Variables

Create a `.env` file with your Convex deployment URL:

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

The Convex URL is automatically generated when you run `bunx convex dev` for the first time.

## Project Structure

```
agent-manager/
├── convex/                    # Convex backend
│   ├── schema.ts              # Database schema
│   ├── http.ts                # HTTP webhook endpoints
│   ├── crons.ts               # Scheduled jobs
│   ├── projects.ts            # Project API
│   ├── tasks.ts               # Task API
│   ├── acceptanceCriteria.ts  # Acceptance criteria API
│   ├── tests.ts               # Test results API
│   ├── chat.ts                # Chat messages API
│   ├── pullRequests.ts        # Pull request API
│   ├── servers.ts             # Server infrastructure API
│   ├── containers.ts          # Container management API
│   ├── webhooks.ts            # Webhook event storage
│   └── internal/              # Internal functions
│       ├── aiResponses.ts     # AI processing
│       ├── history.ts         # Audit trail
│       ├── webhookProcessing.ts
│       └── metrics.ts
├── src/
│   ├── components/            # React components
│   │   ├── ui/                # shadcn/ui components
│   │   ├── projects/          # Project views
│   │   ├── tasks/             # Task views
│   │   ├── servers/           # Server views
│   │   ├── containers/        # Container views
│   │   ├── chat/              # Chat components
│   │   └── modals/            # Modal dialogs
│   ├── types/                 # TypeScript types
│   ├── lib/                   # Utilities
│   ├── App.tsx                # Main application
│   ├── frontend.tsx           # React entry point
│   └── index.ts               # Bun server
├── docs/                      # Documentation
│   ├── ARCHITECTURE.md        # Backend architecture
│   └── AGENTS.md              # Agent system design
└── CLAUDE.md                  # AI assistant instructions
```

## Development

### Running the Development Server

```bash
# Start Convex backend (watches for changes)
bunx convex dev

# In another terminal, start the frontend
bun dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start development server with HMR |
| `bun start` | Start production server |
| `bun test` | Run tests |
| `bunx convex dev` | Start Convex development server |
| `bunx convex deploy` | Deploy Convex to production |

### Database Management

Access the Convex dashboard to manage your database:

```bash
bunx convex dashboard
```

## API Overview

### Public Functions

The Convex backend exposes these query and mutation functions:

#### Projects
- `projects.list` - List all projects
- `projects.get` - Get project by ID
- `projects.create` - Create new project
- `projects.update` - Update project details
- `projects.updatePlan` - Update project specification

#### Tasks
- `tasks.listByProject` - Get tasks for a project
- `tasks.listAllWithProjects` - Get all tasks with project info
- `tasks.get` - Get task with related data
- `tasks.create` / `update` / `delete` - CRUD operations
- `tasks.updateCategory` - Move task between columns
- `tasks.addDependency` / `removeDependency` - Manage dependencies

#### Chat
- `chat.listByProject` / `listByTask` - Get chat history
- `chat.sendProjectMessage` / `sendTaskMessage` - Send messages

#### Pull Requests
- `pullRequests.getByTask` - Get PR for a task
- `pullRequests.create` / `updateStatus` - Manage PRs
- `pullRequests.merge` / `close` - PR lifecycle

#### Infrastructure
- `servers.list` / `get` / `create` / `update` - Server management
- `containers.list` / `start` / `stop` / `restart` - Container operations

### Webhook Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/webhooks/github` | POST | GitHub PR/push events |
| `/webhooks/cicd` | POST | CI/CD status updates |
| `/webhooks/agent/callback` | POST | AI agent completion callbacks |
| `/api/metrics/server` | POST | Server metrics ingestion |
| `/api/metrics/container` | POST | Container status updates |
| `/health` | GET | Health check |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed documentation on:
- Why Convex was chosen as the backend
- Database schema design
- Real-time subscription patterns
- Webhook processing architecture
- Internal function organization

## Agent System

See [docs/AGENTS.md](docs/AGENTS.md) for documentation on:
- AI agent integration design
- Agent job tracking
- Callback handling
- Chat context management

## License

MIT
