# OpenCode Server Migration Plan

## Goal

Re-architect the agent execution path to use the OpenCode headless server instead of the Claude Code CLI wrapper. This removes reliance on our custom Claude wrapper, and uses OpenCode server APIs for model discovery, model selection, prompting, streaming, diffs, tools, and file operations.

## Current State (Claude CLI)

- `packages/container-daemon` spawns `claude` CLI and streams JSON output.
- `packages/agent-gateway` receives stream events via WebSocket, syncs to Convex (`agentMessages`, `agentSessions`).
- Frontend reads Convex streaming messages for live output and model metadata.
- Claude auth is handled via gateway OAuth flow and Convex secrets.

## Target State (OpenCode Server)

- Each agent container runs `opencode serve` (headless server).
- Gateway becomes the OpenCode client/orchestrator (HTTP + SSE).
- Convex stores OpenCode session IDs, messages, and streaming parts.
- Frontend consumes OpenCode-derived messages, model listings, diffs, and tool metadata.

## OpenCode Server API Inventory (from docs)

Core session and messaging:

- Sessions: `POST /session`, `GET /session`, `GET /session/:id`, `DELETE /session/:id`
- Messages: `POST /session/:id/message`, `POST /session/:id/prompt_async`, `GET /session/:id/message`, `GET /session/:id/message/:messageID`
- Commands: `POST /session/:id/command`, `POST /session/:id/shell`
- Session utilities: `POST /session/:id/abort`, `POST /session/:id/share`

Streaming:

- SSE events: `GET /event` or `GET /event/subscribe`
- Event types include `session.created`, `message.created`, `part.updated`, `session.completed`

Model discovery and selection:

- `GET /zen/v1/models`
- `GET /config/providers`

Diffs and file operations:

- `GET /session/:id/diff`
- `GET /file/content`, `GET /file/status`, `GET /find`, `GET /find/file`, `GET /find/symbol`
- `POST /api/find/text`, `POST /api/find/files`, `POST /api/file/read`, `POST /api/file/status`

Tools metadata:

- `GET /experimental/tool/ids`
- `GET /experimental/tool?provider=<p>&model=<m>`

## Mapping: Current Capabilities to OpenCode APIs

| Capability | Current Implementation | OpenCode Server API | Notes |
|---|---|---|---|
| Session lifecycle | `agentSessions` created on exec start | `POST /session`, `DELETE /session/:id` | Store OpenCode session ID on `agentSessions` |
| Prompt + response | `claude -p` via ProcessManager | `POST /session/:id/message` | Use `model.providerID` + `model.modelID` |
| Async prompt | N/A (not exposed) | `POST /session/:id/prompt_async` | Can drive background agent runs |
| Streaming output | Claude stream-json -> gateway WS | `GET /event` SSE, `part.updated` | Translate to `agentMessages` parts |
| Abort | `exec:abort` -> CLI kill | `POST /session/:id/abort` | Update `agentSessions` status |
| Model list | Convex `aiProviders` | `GET /zen/v1/models`, `/config/providers` | Replace provider/model catalog |
| Diffs | Not surfaced | `GET /session/:id/diff` | New UI surface for diff results |
| File search | Not surfaced | `GET /find`, `POST /api/find/text` | Optional editor/inspection tooling |
| File read | Not surfaced | `GET /file/content`, `POST /api/file/read` | Optional editor/inspection tooling |
| Tool schemas | Not surfaced | `GET /experimental/tool` | Display tool metadata in UI |

## Gaps and Coverage

### OpenCode Server features the app does not expose today

- Session diffs (`GET /session/:id/diff`) are not shown in UI.
- Tool schema listing is not shown in UI.
- File search/read APIs are not surfaced (currently only CLI output).
- SSE event stream is not used directly; we currently stream via gateway WebSocket.

### App features not provided by OpenCode Server

- Container lifecycle management (create/stop/restart/delete) is our gateway + Tailscale flow.
- Task phase orchestration, prompts, and lifecycle is our Convex + gateway logic.
- Convex-backed history, task system, and Kanban UI.
- Existing OAuth flow for Claude tokens (OpenCode has its own provider config, not OAuth flow).
- `code-agent-tools` CLI for Convex mutation calls (OpenCode does not replace this).

## Architecture Changes (Proposed)

### 1. Container Image

- Replace `@anthropic-ai/claude-code` with OpenCode binary.
- Start `opencode serve --hostname 0.0.0.0 --port 4096` in entrypoint.
- Expose OpenCode config via env or a mounted config file (provider creds, default models).
- Keep `code-agent-tools` binary in PATH for task/Convex interactions.

### 2. Gateway

- Add an OpenCode client adapter in `packages/agent-gateway`.
- Replace `exec:start` WebSocket messages with OpenCode HTTP calls:
  - `POST /session` to create session
  - `POST /session/:id/message` with phase prompt and model selection
  - `GET /event` SSE to stream parts
  - `GET /session/:id/diff` for diff capture (optional)
- Map OpenCode events to Convex `agentMessages` schema:
  - `message.created` and `part.updated` -> `agentMessages.create` or `createBatch`
  - `session.completed` -> `agentSessions.updateStatus`
- Implement cancellation with `POST /session/:id/abort`.
- Remove Claude OAuth flow endpoints (`/auth/*`) and related Convex flow tables.

### 3. Convex Schema and Storage

- Extend `agentSessions` to store OpenCode `sessionId`, `providerId`, `modelId`.
- Extend `agentMessages` to store OpenCode message/part IDs, or add a new table
  (`opencodeParts`) if needed for accurate part streaming.
- Add optional `sessionDiffs` table for diff snapshots keyed by session/message.
- Add `opencodeModels` cache table if we need cached provider/model listing in UI.

### 4. Frontend

- Replace provider/model selection source to use OpenCode providers/models.
- Update streaming UI to handle OpenCode `parts` (text, tool_use, tool_result).
- Add a Diff tab in task detail view to show `session/:id/diff` results.
- Add optional Tool Catalog UI in Settings using `/experimental/tool` data.

## Detailed Implementation Plan

### Phase 1: Research and Proof of Concept

1. Run `opencode serve` in a local container, verify:
   - `GET /zen/v1/models` and `/config/providers` return expected data.
   - `POST /session` + `POST /session/:id/message` works with model selection.
   - `GET /event` SSE emits `part.updated` during streaming.
   - `GET /session/:id/diff` returns structured diffs.
2. Validate how provider credentials are configured (env vs config endpoints).
3. Capture example event payloads for mapping to Convex.

### Phase 2: Container Changes

1. Update Dockerfile in gateway build script to install OpenCode.
2. Start OpenCode server in entrypoint (port 4096) instead of claude CLI daemon.
3. Remove Claude CLI installation and OAuth dependencies.
4. Ensure `code-agent-tools` remains available.

### Phase 3: Gateway Adapter

1. Add `opencode-client.ts` in `packages/agent-gateway`:
   - `createSession`, `sendMessage`, `subscribeEvents`, `getDiff`, `abortSession`.
2. Replace ProcessManager/WebSocket command flow for execution.
3. Translate OpenCode events to Convex writes:
   - Use `agentMessages.createBatch` for streaming performance.
   - Update `agentSessions` on `session.completed`.
4. Add a streaming buffer to coalesce high-frequency `part.updated` events.

### Phase 4: Convex Integration

1. Add fields to `agentSessions` and `agentMessages` for OpenCode IDs.
2. Add `sessionDiffs` table (optional) to store diffs by session/message.
3. Add `opencodeModels` cache (optional) and a refresh mutation.

### Phase 5: Frontend Integration

1. Update provider/model settings screens to pull from OpenCode.
2. Update chat streaming UI to render OpenCode parts:
   - `text` parts
   - `tool_use` and `tool_result`
3. Add Diff tab to Task detail to show `sessionDiffs`.
4. Add Tool schema view (optional) from `/experimental/tool`.

### Phase 6: Cleanup and Removal

1. Remove Claude OAuth flows in gateway + Convex tables.
2. Remove `claude` CLI install in container build.
3. Remove any Claude-specific configs and docs.

## Risks and Mitigations

- **SSE reliability**: buffer and retry; store last event cursor if supported.
- **Event ordering**: add sequence numbers on ingest or rely on event timestamps.
- **Config mismatch**: OpenCode provider configuration is not yet mapped; verify configuration schema early.
- **Model naming differences**: normalize provider/model IDs to existing UI expectations.
- **Diff volume**: store only last diff per session or per message to limit storage.

## Rollout Strategy

1. Feature flag OpenCode execution in gateway.
2. Dual-run on a subset of tasks (OpenCode + existing Claude path) for parity.
3. Move all new containers to OpenCode once stable.
4. Remove Claude-specific infrastructure after validation.

## Open Questions

1. Provider credentials: what is the canonical OpenCode config format for keys?
2. Should sessions map 1:1 with tasks or per phase (current model)?
3. Is `session/:id/diff` sufficient or should we compute diffs per message for UI?
4. Should we expose OpenCode file APIs to the UI, or keep them internal only?
