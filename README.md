# Agent Manager

A real-time agent management platform for orchestrating AI coding agents running in Docker containers. Features a WebSocket-based gateway for streaming Claude Code CLI output, Convex for persistence and real-time subscriptions, and Tailscale for secure container networking.

## Features

- **Agent Containers**: Docker containers with Claude Code CLI, connected via Tailscale mesh network
- **Agent Gateway**: WebSocket server that orchestrates container connections and streams CLI output
- **Project Management**: Create and manage software projects with specifications and task breakdown
- **Task Tracking**: Kanban-style task management with dependencies, acceptance criteria, and test tracking
- **Real-time Streaming**: Stream Claude Code CLI output in real-time via WebSocket protocol
- **Infrastructure Monitoring**: Server and container management with real-time metrics
- **Pull Request Management**: Track PRs, code reviews, issues, and CI/CD status

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | [Bun](https://bun.sh) |
| Frontend | React 19, TypeScript, Tailwind CSS |
| UI Components | [shadcn/ui](https://ui.shadcn.com) (Radix primitives) |
| Backend | [Convex](https://convex.dev) (serverless database + functions) |
| Gateway | Bun WebSocket server with Convex sync |
| Containers | Docker + Tailscale SSH |
| Icons | [Lucide React](https://lucide.dev) |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.3.4 or later
- [Docker](https://docker.com) for running agent containers
- A [Convex](https://convex.dev) account (free tier available)
- A [Tailscale](https://tailscale.com) account for container networking

### Installation

```bash
# Install dependencies
bun install

# Start all development servers (Convex must run separately)
bunx convex dev  # In a separate terminal
bun dev          # Starts frontend, backend, and agent-gateway
```

The application will be available at:
- Frontend: `http://localhost:3000`
- Agent Gateway: `http://localhost:3100` (WebSocket + HTTP API)

### Environment Variables

Create `.env` files as needed:

**Root `.env`** (for Convex):
```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

**Agent containers** (`images/agent/.env`):
```env
TS_AUTHKEY=tskey-auth-xxx           # Tailscale auth key
GH_USERNAME=your-github-username    # GitHub credentials
GH_TOKEN=ghp_xxx
MANAGER_WS_URL=ws://gateway.tailnet:3100  # Gateway WebSocket URL
```

See `images/agent/.env.example` for all available options.

## Project Structure

```
agent-manager/
├── packages/
│   ├── frontend/              # React 19 frontend application
│   │   ├── src/
│   │   │   ├── components/    # React components
│   │   │   │   ├── ui/        # shadcn/ui components
│   │   │   │   ├── projects/  # Project views
│   │   │   │   ├── tasks/     # Task views
│   │   │   │   ├── servers/   # Server views
│   │   │   │   └── containers/# Container views
│   │   │   ├── types/         # TypeScript types
│   │   │   └── lib/           # Utilities
│   │   └── package.json
│   │
│   ├── backend/               # Bun HTTP server for frontend
│   │   └── package.json
│   │
│   ├── convex/                # Convex serverless backend
│   │   ├── schema.ts          # Database schema
│   │   ├── http.ts            # HTTP webhook endpoints
│   │   ├── projects.ts        # Project API
│   │   ├── tasks.ts           # Task API
│   │   ├── agentSessions.ts   # Agent session tracking
│   │   ├── agentMessages.ts   # CLI output storage
│   │   └── package.json
│   │
│   ├── agent-gateway/         # WebSocket server for containers
│   │   ├── src/
│   │   │   ├── index.ts       # Gateway server
│   │   │   ├── connections.ts # Connection manager
│   │   │   └── convex-sync.ts # Convex integration
│   │   ├── bin/
│   │   │   └── create-agent   # Container creation script
│   │   └── package.json
│   │
│   ├── container-api/         # API running inside containers
│   │   ├── src/
│   │   │   ├── index.ts       # Elysia HTTP server
│   │   │   ├── process-manager.ts  # Claude CLI process manager
│   │   │   ├── manager-connection.ts # Gateway WebSocket client
│   │   │   └── auth-manager.ts # OAuth flow handling
│   │   └── package.json
│   │
│   └── agent-shared/          # Shared protocol types
│       ├── src/
│       │   └── index.ts       # WebSocket message types
│       └── package.json
│
├── images/
│   └── agent/                 # Agent container Docker image
│       ├── Dockerfile         # Container image definition
│       ├── docker-compose.yml # Container orchestration
│       ├── entrypoint.sh      # Container startup script
│       └── .env.example       # Environment template
│
├── docs/                      # Documentation
│   ├── ARCHITECTURE.md        # Backend architecture
│   └── AGENTS.md              # Agent system design
│
├── package.json               # Root workspace config
├── turbo.json                 # Turbo build config
└── CLAUDE.md                  # AI assistant instructions
```

## Development

### Running the Development Servers

```bash
# Start Convex backend (watches for changes)
bunx convex dev

# In another terminal, start all services (frontend, backend, gateway)
bun dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start frontend, backend, and agent-gateway (via Turbo) |
| `bun run dev:frontend` | Start only the frontend |
| `bun run dev:backend` | Start only the backend |
| `bun run dev:gateway` | Start only the agent-gateway |
| `bun run dev:convex` | Start Convex dev server |
| `bun run create-agent` | Create a new agent container |
| `bun run start` | Start production backend |
| `bun run start:gateway` | Start production gateway |
| `bunx convex dev` | Start Convex development server |
| `bunx convex deploy` | Deploy Convex to production |

### Creating Agent Containers

Use the `create-agent` script to spin up new agent containers:

```bash
# Create an agent for a specific repository
bun run create-agent --repo owner/repo-name

# With options
bun run create-agent \
  --repo owner/repo-name \
  --branch feature-branch \
  --name my-agent \
  --server ws://gateway.tailnet:3100
```

The script:
1. Generates a unique container name (e.g., `proud-blue-falcon`)
2. Allocates a unique WireGuard port for direct Tailscale connections
3. Starts the container with the specified repository cloned
4. Connects to the agent-gateway via WebSocket

### Database Management

Access the Convex dashboard to manage your database:

```bash
bunx convex dashboard
```

## API Overview

### Agent Gateway API

The agent-gateway provides HTTP endpoints and WebSocket connections for container orchestration:

#### HTTP Endpoints (port 3100)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Gateway health check with stats |
| `/containers` | GET | List connected containers |
| `/containers/:id` | GET | Get specific container info |
| `/containers/create` | POST | Create new agent container |
| `/containers/:id/auth` | POST | Push auth token to container |
| `/exec` | POST | Start execution on a container |
| `/exec/:id/abort` | POST | Abort running execution |

#### WebSocket Protocol

Containers connect to `ws://gateway:3100` and communicate using JSON messages:

```typescript
// Message structure
{
  id: string;          // Unique message ID
  type: MessageType;   // Message type (connect, exec:start, exec:stream, etc.)
  payload: T;          // Type-specific payload
  timestamp: number;   // Unix timestamp
  correlationId?: string; // For request/response tracking
}
```

Key message types:
- `connect` / `connected` - Container registration
- `exec:start` / `exec:stream` / `exec:complete` - CLI execution
- `heartbeat` - Keep-alive ping/pong
- `status:health` - Container health updates

### Convex Functions

#### Projects & Tasks
- `projects.list` / `get` / `create` / `update` - Project management
- `tasks.listByProject` / `get` / `create` / `update` - Task management
- `tasks.updateCategory` - Move task between columns

#### Agent Sessions
- `agentSessions.create` - Create new CLI session
- `agentSessions.updateStatus` - Update session status
- `agentSessions.listByContainer` - List sessions for a container

#### Agent Messages
- `agentMessages.create` - Store CLI output message
- `agentMessages.listBySession` - Get messages for a session

#### Infrastructure
- `servers.list` / `get` / `create` / `update` - Server management
- `containers.list` / `updateAgentStatus` - Container tracking

### Convex Webhook Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/webhooks/github` | POST | GitHub PR/push events |
| `/webhooks/cicd` | POST | CI/CD status updates |
| `/api/metrics/server` | POST | Server metrics ingestion |
| `/health` | GET | Health check |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed documentation on:
- Why Convex was chosen as the backend
- Database schema design with agent tables
- Real-time subscription patterns
- Agent Gateway architecture
- Container-to-Gateway communication

## Agent System

See [docs/AGENTS.md](docs/AGENTS.md) for documentation on:
- Agent Gateway WebSocket server
- Container API and Claude CLI integration
- WebSocket protocol specification
- Container lifecycle management
- Convex integration for persistence

## License

MIT
