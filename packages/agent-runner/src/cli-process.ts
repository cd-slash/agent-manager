import type {
  CliOutputMessage,
  SessionConfig,
  SessionStatus,
} from "@agent-manager/agent-shared";

export interface CliSession {
  sessionId: string;
  process: ReturnType<typeof Bun.spawn> | null;
  status: SessionStatus;
  startedAt: number;
  config: SessionConfig;
}

export type OutputCallback = (sessionId: string, output: CliOutputMessage) => void;
export type CompleteCallback = (sessionId: string, exitCode: number | null) => void;
export type ErrorCallback = (sessionId: string, error: string) => void;

export class CliProcessManager {
  private sessions: Map<string, CliSession> = new Map();
  private onOutput: OutputCallback;
  private onComplete: CompleteCallback;
  private onError: ErrorCallback;

  constructor(
    onOutput: OutputCallback,
    onComplete: CompleteCallback,
    onError: ErrorCallback
  ) {
    this.onOutput = onOutput;
    this.onComplete = onComplete;
    this.onError = onError;
  }

  async startSession(
    sessionId: string,
    prompt: string,
    config: SessionConfig = {}
  ): Promise<void> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const session: CliSession = {
      sessionId,
      process: null,
      status: "starting",
      startedAt: Date.now(),
      config,
    };
    this.sessions.set(sessionId, session);

    try {
      const args = this.buildCliArgs(prompt, config);
      const cwd = config.workingDirectory || process.cwd();

      const proc = Bun.spawn(["claude", ...args], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          // Ensure print mode outputs JSON
          CLAUDE_CODE_OUTPUT_FORMAT: "json",
        },
      });

      session.process = proc;
      session.status = "running";

      // Handle stdout - streaming JSON lines
      this.handleOutputStream(sessionId, proc.stdout);

      // Handle stderr
      this.handleErrorStream(sessionId, proc.stderr);

      // Handle process exit
      proc.exited.then((exitCode) => {
        const sess = this.sessions.get(sessionId);
        if (sess) {
          sess.status = exitCode === 0 ? "completed" : "failed";
          this.onComplete(sessionId, exitCode);
        }
      });
    } catch (error) {
      session.status = "failed";
      this.onError(
        sessionId,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private buildCliArgs(prompt: string, config: SessionConfig): string[] {
    const args: string[] = [
      "--print", // Enable print mode for JSON output
      "--output-format",
      "stream-json", // Stream JSON output
    ];

    if (config.model) {
      args.push("--model", config.model);
    }

    if (config.allowedTools && config.allowedTools.length > 0) {
      args.push("--allowedTools", config.allowedTools.join(","));
    }

    if (config.maxTurns) {
      args.push("--max-turns", String(config.maxTurns));
    }

    if (config.systemPrompt) {
      args.push("--system-prompt", config.systemPrompt);
    }

    // Add the prompt as the final argument
    args.push(prompt);

    return args;
  }

  private async handleOutputStream(
    sessionId: string,
    stdout: ReadableStream<Uint8Array>
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";

    const reader = stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete JSON lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line) as CliOutputMessage;
              this.onOutput(sessionId, message);
            } catch (parseError) {
              // Not valid JSON, might be a partial line or non-JSON output
              console.warn(`[${sessionId}] Non-JSON output:`, line);
            }
          }
        }
      }

      // Process any remaining buffer content
      if (buffer.trim()) {
        try {
          const message = JSON.parse(buffer) as CliOutputMessage;
          this.onOutput(sessionId, message);
        } catch {
          console.warn(`[${sessionId}] Final non-JSON output:`, buffer);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async handleErrorStream(
    sessionId: string,
    stderr: ReadableStream<Uint8Array>
  ): Promise<void> {
    const decoder = new TextDecoder();
    const reader = stderr.getReader();
    let errorBuffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        errorBuffer += decoder.decode(value, { stream: true });
      }

      if (errorBuffer.trim()) {
        this.onError(sessionId, errorBuffer.trim());
      }
    } finally {
      reader.releaseLock();
    }
  }

  cancelSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.process) {
      return false;
    }

    session.status = "cancelled";
    session.process.kill();
    return true;
  }

  getSession(sessionId: string): CliSession | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSessions(): CliSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === "running" || s.status === "starting"
    );
  }

  removeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
}
