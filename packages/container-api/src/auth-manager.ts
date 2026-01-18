/**
 * Auth Manager
 *
 * Manages Claude CLI authentication via the ANTHROPIC_AUTH_TOKEN environment variable.
 *
 * IMPORTANT: Authentication state is ONLY controlled via the environment variable.
 * - NEVER read from or write to the credentials file (~/.claude/.credentials.json)
 * - NEVER poll the credentials file for token changes
 * - The ONLY way to change authentication status is via setToken() or removeToken()
 *   which modify the ANTHROPIC_AUTH_TOKEN environment variable
 *
 * Token acquisition methods:
 * 1. Interactive OAuth flow: Uses `claude setup-token` TUI to get a new token
 * 2. Manual token input: User pastes a token they obtained elsewhere
 *
 * OAuth flow uses `claude setup-token` which requires a PTY for interactive input.
 * Uses Bun.spawn with terminal option for proper PTY handling of the Ink TUI.
 */

import { EventEmitter } from "node:events";
import type { AuthStatus, OAuthFlowState, OAuthStartResult, OAuthCompleteResult } from "./types";

// Type for Bun.spawn subprocess with terminal
interface BunSubprocess {
  terminal?: {
    write(data: string): void;
    close(): void;
  };
  kill(): void;
  exited: Promise<number>;
}

// State object stored in flow to track PTY output and token discovery
interface OAuthFlowOutput {
  allOutput: string;
  foundToken: string;
  codeWasSent: boolean;
}

export class AuthManager extends EventEmitter {
  private activeFlows: Map<string, OAuthFlowState> = new Map();
  private cachedStatus: AuthStatus | null = null;
  private lastCheckTime = 0;
  private readonly CACHE_TTL_MS = 5000; // 5 second cache

  constructor() {
    super();
  }

  /**
   * Initialize the auth manager (no-op, kept for API compatibility)
   */
  async startWatching(): Promise<void> {
    console.log("[auth] Auth manager initialized (env var based authentication)");
  }

  /**
   * Cleanup (no-op, kept for API compatibility)
   */
  async stopWatching(): Promise<void> {
    // No-op - no file watching to stop
  }

  /**
   * Get current authentication status
   * Checks if ANTHROPIC_AUTH_TOKEN environment variable is set.
   */
  async getStatus(): Promise<AuthStatus> {
    const now = Date.now();

    // Return cached status if still valid
    if (this.cachedStatus && now - this.lastCheckTime < this.CACHE_TTL_MS) {
      return this.cachedStatus;
    }

    // Check if ANTHROPIC_AUTH_TOKEN environment variable is set
    const token = process.env.ANTHROPIC_AUTH_TOKEN;
    const isAuthenticated = !!token && token.length > 0;

    this.cachedStatus = {
      provider: "anthropic",
      authenticated: isAuthenticated,
      method: isAuthenticated ? "oauth" : undefined,
    };
    this.lastCheckTime = now;
    return this.cachedStatus;
  }

  /**
   * Set OAuth token directly
   * This is used when the manager pushes a token to the container.
   * Sets the ANTHROPIC_AUTH_TOKEN environment variable.
   */
  async setToken(token: string): Promise<void> {
    console.log("[auth] Setting OAuth token via environment variable");

    // Set the environment variable
    process.env.ANTHROPIC_AUTH_TOKEN = token;

    // Invalidate cache and emit change
    this.cachedStatus = null;
    this.lastCheckTime = 0;

    const status = await this.getStatus();
    this.emit("auth:changed", {
      authenticated: status.authenticated,
      method: status.method,
    });
  }

  /**
   * Remove OAuth token
   * Clears the ANTHROPIC_AUTH_TOKEN environment variable.
   */
  async removeToken(): Promise<void> {
    console.log("[auth] Removing OAuth token");

    // Clear the environment variable
    delete process.env.ANTHROPIC_AUTH_TOKEN;

    // Invalidate cache and emit change
    this.cachedStatus = null;
    this.lastCheckTime = 0;

    this.emit("auth:changed", {
      authenticated: false,
    });
  }

  /**
   * Start OAuth flow using `claude setup-token`
   * Uses Bun.spawn with terminal option for proper PTY handling of the Ink TUI.
   * Returns a URL for the user to visit.
   */
  async startOAuthFlow(): Promise<OAuthStartResult> {
    const flowId = crypto.randomUUID();
    const expiresIn = 600; // 10 minutes

    console.log(`[auth] Starting OAuth flow: ${flowId}`);

    // Shared state to track output across both start and complete phases
    // This is mutable so we can accumulate output in the data callback
    const outputState: OAuthFlowOutput = {
      allOutput: "",
      foundToken: "",
      codeWasSent: false,
    };

    // State to resolve URL promise
    let urlResolve: ((url: string) => void) | null = null;
    let urlReject: ((err: Error) => void) | null = null;
    let foundUrl = "";

    // Use Bun.spawn with terminal option for proper PTY handling
    const proc = Bun.spawn(["claude", "setup-token"], {
      terminal: {
        cols: 120,
        rows: 40,
        data(terminal, data) {
          const chunk = data.toString();
          outputState.allOutput += chunk;

          // Clean ANSI codes for logging
          const cleanChunk = chunk
            .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
            .replace(/\x1b\]0;[^\x07]*\x07/g, "")
            .replace(/[\r\n]+/g, " ")
            .trim();

          if (cleanChunk) {
            console.log(`[auth] PTY: ${cleanChunk.substring(0, 200)}`);
          }

          // Look for OAuth URL in the output
          const urlMatch = chunk.match(/https:\/\/claude\.ai\/oauth\/authorize[^\s\x1b\]]+/);
          if (urlMatch && !foundUrl) {
            foundUrl = urlMatch[0].replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
            console.log(`[auth] Found OAuth URL: ${foundUrl}`);
            if (urlResolve) {
              urlResolve(foundUrl);
              urlResolve = null;
            }
          }

          // Look for token in the output (multiple possible formats)
          // Tokens typically start with sk-ant- followed by alphanumeric chars
          const tokenPatterns = [
            /sk-ant-[a-zA-Z0-9_-]{20,}/g,  // General format
            /sk-ant-oat01-[a-zA-Z0-9_-]+/g, // OAuth token format
          ];

          for (const pattern of tokenPatterns) {
            const matches = chunk.match(pattern);
            if (matches && !outputState.foundToken) {
              // Clean ANSI codes from token
              const token = matches[0].replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
              if (token.length > 20) { // Sanity check
                outputState.foundToken = token;
                console.log(`[auth] ✅ Token found in PTY output: ${token.substring(0, 20)}...`);
              }
            }
          }
        },
      },
      env: process.env,
    }) as BunSubprocess;

    // Wait for URL with timeout
    const url = await new Promise<string>((resolve, reject) => {
      urlResolve = resolve;
      urlReject = reject;

      // If URL was already found during setup
      if (foundUrl) {
        resolve(foundUrl);
        return;
      }

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error(`Timeout waiting for OAuth URL. Output so far: ${outputState.allOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")}`));
      }, 60000); // 60 second timeout

      // Also check when process exits
      proc.exited.then((exitCode) => {
        clearTimeout(timeout);
        if (!foundUrl) {
          reject(new Error(`Process exited (code ${exitCode}) without URL. Output: ${outputState.allOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")}`));
        }
      });
    });

    // Store flow state with process handle and shared output state
    // The outputState is mutable, so completeOAuthFlow can read accumulated output
    this.activeFlows.set(flowId, {
      flowId,
      url,
      expiresAt: Date.now() + expiresIn * 1000,
      port: 0,
      server: outputState, // Store outputState in 'server' field (re-purposing unused field)
      process: proc, // BunSubprocess - we write code via terminal.write()
    });

    console.log(`[auth] OAuth flow started: ${flowId}, URL: ${url}`);
    return { flowId, url, expiresIn };
  }

  /**
   * Complete OAuth flow with authorization code
   * Writes code to the PTY via terminal.write() and captures the token from output.
   *
   * The token appears in the Ink TUI output after successful authentication.
   * We also poll the credentials file as a backup.
   */
  async completeOAuthFlow(flowId: string, code: string): Promise<OAuthCompleteResult> {
    const flow = this.activeFlows.get(flowId);
    if (!flow) {
      throw new Error(`OAuth flow not found: ${flowId}`);
    }

    if (Date.now() > flow.expiresAt) {
      this.activeFlows.delete(flowId);
      throw new Error("OAuth flow expired");
    }

    console.log(`[auth] ⏳ Completing OAuth flow: ${flowId}`);

    const proc = flow.process as BunSubprocess | undefined;
    const outputState = flow.server as OAuthFlowOutput | undefined;

    if (!proc || !proc.terminal) {
      this.activeFlows.delete(flowId);
      throw new Error("OAuth flow process/terminal not available");
    }

    try {
      // Extract just the authorization code (before any # fragment)
      const codeOnly = (code.split("#")[0] ?? code).trim();

      console.log(`[auth] ⏳ Sending authorization code (${codeOnly.length} chars) to PTY`);

      // Write the code to the PTY terminal
      // Add a small delay to ensure the TUI is ready for input
      await Bun.sleep(500);

      // Send the code followed by Enter (use \r for terminal)
      proc.terminal.write(codeOnly + "\r");

      if (outputState) {
        outputState.codeWasSent = true;
      }

      console.log(`[auth] ⏳ Code sent, waiting for token from PTY output...`);

      // Helper to extract token from accumulated output
      const extractTokenFromOutput = (): string | null => {
        if (!outputState) return null;

        // Already found via data callback
        if (outputState.foundToken) {
          return outputState.foundToken;
        }

        // Try to find in accumulated output
        const cleanOutput = outputState.allOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
        const patterns = [
          /sk-ant-[a-zA-Z0-9_-]{20,}/,
          /sk-ant-oat01-[a-zA-Z0-9_-]+/,
        ];

        for (const pattern of patterns) {
          const match = cleanOutput.match(pattern);
          if (match && match[0].length > 20) {
            return match[0];
          }
        }

        return null;
      };

      // Poll PTY output for token (check every 500ms)
      const pollPtyOutput = async (): Promise<string | null> => {
        // Poll for up to 60 seconds (120 iterations at 500ms)
        for (let i = 0; i < 120; i++) {
          await Bun.sleep(500);

          // Check if token was found in PTY output
          const outputToken = extractTokenFromOutput();
          if (outputToken) {
            console.log(`[auth] ✅ Token found in PTY output: ${outputToken.substring(0, 20)}...`);
            return outputToken;
          }
        }

        return null;
      };

      // Race between PTY output polling and process exit/timeout
      const processExitPromise = new Promise<{ exitCode: number; source: "exit" }>((resolve) => {
        proc.exited.then((exitCode) => {
          console.log(`[auth] Process exited with code: ${exitCode}`);
          resolve({ exitCode, source: "exit" });
        });
      });

      const timeoutPromise = new Promise<{ exitCode: null; source: "timeout" }>((resolve) => {
        setTimeout(() => {
          console.log(`[auth] ⏱️ Process timeout after 120s`);
          resolve({ exitCode: null, source: "timeout" });
        }, 120000);
      });

      const pollingPromise = pollPtyOutput();

      // Wait for either polling to find token, or process/timeout
      const result = await Promise.race([
        pollingPromise.then(token => ({ type: "token" as const, token })),
        processExitPromise.then(r => ({ type: "process" as const, ...r })),
        timeoutPromise.then(r => ({ type: "timeout" as const, ...r })),
      ]);

      let foundToken = "";

      // Handle result
      if (result.type === "token" && result.token) {
        foundToken = result.token;
      } else if (result.type === "process" || result.type === "timeout") {
        // Process exited or timed out, check PTY output one more time
        const outputToken = extractTokenFromOutput();
        if (outputToken) {
          console.log(`[auth] ✅ Token found in PTY output (final check): ${outputToken.substring(0, 20)}...`);
          foundToken = outputToken;
        }

        // Log accumulated output for debugging if no token found
        if (!foundToken && outputState) {
          const cleanOutput = outputState.allOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\]0;[^\x07]*\x07/g, "");
          console.log(`[auth] ⚠️ No token found. Full PTY output (${cleanOutput.length} chars):`);
          console.log(cleanOutput.substring(0, 2000));
        }
      }

      // Kill the process if still running
      try {
        proc.kill();
      } catch {}

      // Clean up flow
      this.activeFlows.delete(flowId);

      if (foundToken) {
        this.cachedStatus = null;
        this.lastCheckTime = 0;

        this.emit("auth:changed", {
          authenticated: true,
          method: "oauth",
        });

        console.log(`[auth] ✅ OAuth flow completed successfully`);
        return { success: true, token: foundToken };
      }

      // No token found
      console.log(`[auth] ❌ OAuth flow failed - no token obtained`);
      return { success: false, token: "" };
    } catch (error) {
      this.activeFlows.delete(flowId);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[auth] ❌ OAuth completion failed: ${message}`);
      throw error;
    }
  }

  /**
   * Clean up expired OAuth flows
   */
  cleanupExpiredFlows(): void {
    const now = Date.now();
    for (const [flowId, flow] of this.activeFlows) {
      if (now > flow.expiresAt) {
        // Kill the process if still running
        const proc = flow.process as BunSubprocess | undefined;
        if (proc) {
          try {
            proc.kill();
          } catch {
            // Process may already be dead
          }
        }
        this.activeFlows.delete(flowId);
        console.log(`[auth] Cleaned up expired flow: ${flowId}`);
      }
    }
  }

  /**
   * Clean up all active flows (for shutdown)
   */
  cleanup(): void {
    for (const [flowId, flow] of this.activeFlows) {
      const proc = flow.process as BunSubprocess | undefined;
      if (proc) {
        try {
          proc.kill();
        } catch {
          // Process may already be dead
        }
      }
      console.log(`[auth] Cleaned up flow on shutdown: ${flowId}`);
    }
    this.activeFlows.clear();
  }
}
