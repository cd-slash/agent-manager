/**
 * Process Manager
 *
 * Manages Claude CLI process spawning, streaming output, and lifecycle.
 * Emits events for all process state changes.
 */

import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import * as readline from "node:readline";
import type {
  MessageOptions,
  MessageResult,
  ClaudeStreamData,
  ProcessInfo,
  ActiveProcesses,
} from "./types";

interface RunningProcess {
  process: ChildProcess;
  processId: number;
  sessionId?: string;
  startedAt: number;
  abortController: AbortController;
}

export class ProcessManager extends EventEmitter {
  private processes: Map<number, RunningProcess> = new Map();
  private nextProcessId = 1;

  constructor() {
    super();
  }

  /**
   * Get active processes
   */
  getActiveProcesses(): ActiveProcesses {
    const processIds = Array.from(this.processes.keys());
    return {
      count: processIds.length,
      processIds,
    };
  }

  /**
   * Get info about a specific process
   */
  getProcessInfo(processId: number): ProcessInfo | null {
    const proc = this.processes.get(processId);
    if (!proc) return null;

    return {
      processId: proc.processId,
      sessionId: proc.sessionId,
      startedAt: proc.startedAt,
      status: "running",
    };
  }

  /**
   * Execute a message with streaming output
   * Returns an async generator that yields stream events
   */
  async *executeStream(options: MessageOptions): AsyncGenerator<{
    type: "start" | "data" | "error" | "done";
    processId?: number;
    data?: ClaudeStreamData;
    error?: string;
    exitCode?: number;
  }> {
    const processId = this.nextProcessId++;
    const abortController = new AbortController();

    // Build CLI arguments
    const args = this.buildCliArgs(options);
    args.push("--output-format", "stream-json");

    console.log(`[process] Starting process ${processId}: claude ${args.join(" ")}`);

    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: options.workingDirectory || "/workspace",
      env: { ...process.env },
      signal: abortController.signal,
    });

    const runningProc: RunningProcess = {
      process: proc,
      processId,
      startedAt: Date.now(),
      abortController,
    };

    this.processes.set(processId, runningProc);

    // Emit start event
    yield { type: "start", processId };
    this.emit("process:started", { processId });

    // Send the message to stdin
    proc.stdin.write(options.message);
    proc.stdin.end();

    // Create readline interface for stdout
    const rl = readline.createInterface({
      input: proc.stdout,
      crlfDelay: Infinity,
    });

    let sessionId: string | undefined;
    let lastResult: ClaudeStreamData | null = null;

    try {
      // Process stdout line by line (stream-json format)
      for await (const line of rl) {
        if (!line.trim()) continue;

        try {
          const data = JSON.parse(line) as ClaudeStreamData;

          // Track session ID
          if (data.type === "system" && data.session_id) {
            sessionId = data.session_id;
            runningProc.sessionId = sessionId;
          }

          // Track result for final summary
          if (data.type === "result") {
            lastResult = data;
          }

          yield { type: "data", data };
          this.emit("process:output", { processId, data });
        } catch (parseError) {
          // Log but don't fail on parse errors
          console.warn(`[process] Failed to parse line: ${line}`);
        }
      }

      // Wait for process to complete
      const exitCode = await new Promise<number>((resolve) => {
        proc.on("close", (code) => resolve(code ?? 0));
      });

      if (exitCode === 0) {
        yield { type: "done" };
        this.emit("process:completed", {
          processId,
          result: {
            success: true,
            processId,
            session_id: sessionId,
            result: lastResult?.result,
            total_cost_usd: lastResult?.total_cost_usd,
            duration_ms: lastResult?.duration_ms,
            num_turns: lastResult?.num_turns,
            modelUsage: lastResult?.modelUsage,
          },
        });
      } else {
        // Collect stderr
        let stderr = "";
        proc.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        yield { type: "error", exitCode, error: stderr };
        this.emit("process:error", { processId, error: stderr, exitCode });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield { type: "error", error: errorMessage };
      this.emit("process:error", { processId, error: errorMessage });
    } finally {
      this.processes.delete(processId);
      rl.close();
    }
  }

  /**
   * Execute a message synchronously (wait for completion)
   */
  async execute(options: MessageOptions): Promise<MessageResult> {
    const processId = this.nextProcessId++;
    const abortController = new AbortController();

    // Build CLI arguments
    const args = this.buildCliArgs(options);
    args.push("--output-format", "json");

    console.log(`[process] Starting sync process ${processId}: claude ${args.join(" ")}`);

    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: options.workingDirectory || "/workspace",
      env: { ...process.env },
      signal: abortController.signal,
    });

    const runningProc: RunningProcess = {
      process: proc,
      processId,
      startedAt: Date.now(),
      abortController,
    };

    this.processes.set(processId, runningProc);
    this.emit("process:started", { processId });

    // Send the message to stdin
    proc.stdin.write(options.message);
    proc.stdin.end();

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (exitCode) => {
        this.processes.delete(processId);

        if (exitCode === 0) {
          try {
            const result = JSON.parse(stdout);
            const messageResult: MessageResult = {
              success: true,
              processId,
              session_id: result.session_id,
              result: result.result,
              total_cost_usd: result.total_cost_usd,
              duration_ms: result.duration_ms,
              num_turns: result.num_turns,
              usage: result.usage,
              modelUsage: result.modelUsage,
            };

            this.emit("process:completed", { processId, result: messageResult });
            resolve(messageResult);
          } catch {
            const messageResult: MessageResult = {
              success: true,
              processId,
              result: stdout,
            };
            this.emit("process:completed", { processId, result: messageResult });
            resolve(messageResult);
          }
        } else {
          const messageResult: MessageResult = {
            success: false,
            processId,
            error: stderr || "Process failed",
            exitCode: exitCode ?? 1,
          };
          this.emit("process:error", { processId, error: stderr, exitCode });
          resolve(messageResult);
        }
      });

      proc.on("error", (err) => {
        this.processes.delete(processId);
        const messageResult: MessageResult = {
          success: false,
          processId,
          error: err.message,
          exitCode: 1,
        };
        this.emit("process:error", { processId, error: err.message });
        resolve(messageResult);
      });
    });
  }

  /**
   * Abort a running process
   */
  abort(processId: number): boolean {
    const proc = this.processes.get(processId);
    if (!proc) {
      return false;
    }

    console.log(`[process] Aborting process ${processId}`);

    try {
      proc.abortController.abort();
      proc.process.kill("SIGTERM");

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (this.processes.has(processId)) {
          proc.process.kill("SIGKILL");
          this.processes.delete(processId);
        }
      }, 5000);

      return true;
    } catch (error) {
      console.error(`[process] Error aborting process ${processId}:`, error);
      return false;
    }
  }

  /**
   * Abort all running processes
   */
  abortAll(): void {
    for (const processId of this.processes.keys()) {
      this.abort(processId);
    }
  }

  /**
   * Build CLI arguments from message options
   */
  private buildCliArgs(options: MessageOptions): string[] {
    const args: string[] = [];

    // Model
    if (options.model) {
      args.push("--model", options.model);
    }

    // Session
    if (options.sessionId) {
      args.push("--session", options.sessionId);
    } else if (options.continue) {
      args.push("--continue");
    }

    // System prompt
    if (options.systemPrompt) {
      args.push("--system-prompt", options.systemPrompt);
    }

    if (options.appendSystemPrompt) {
      args.push("--append-system-prompt", options.appendSystemPrompt);
    }

    // Tools
    if (options.allowedTools?.length) {
      args.push("--allowedTools", options.allowedTools.join(","));
    }

    if (options.disallowedTools?.length) {
      args.push("--disallowedTools", options.disallowedTools.join(","));
    }

    // Budget
    if (options.maxBudget !== undefined) {
      args.push("--max-turns", String(Math.ceil(options.maxBudget * 100))); // Rough conversion
    }

    // Permission mode
    if (options.permissionMode) {
      switch (options.permissionMode) {
        case "bypassPermissions":
          args.push("--dangerously-skip-permissions");
          break;
        case "acceptEdits":
          args.push("--allowedTools", "Edit,Write,Bash");
          break;
        case "plan":
          args.push("--allowedTools", "Read,Glob,Grep,WebSearch,WebFetch");
          break;
      }
    }

    // Additional directories
    if (options.addDir?.length) {
      for (const dir of options.addDir) {
        args.push("--add-dir", dir);
      }
    }

    // Pipe mode (read from stdin)
    args.push("-p");

    return args;
  }
}
