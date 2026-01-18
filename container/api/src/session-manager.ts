/**
 * Session Manager
 *
 * Manages Claude CLI session storage and retrieval.
 * Sessions are stored by the Claude CLI in ~/.claude/projects/
 */

import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Session, SessionMessage } from "./types";

// Claude CLI stores sessions in ~/.claude/projects/<project-hash>/sessions/
const CLAUDE_PROJECTS_DIR = path.join(process.env.HOME || "/root", ".claude", "projects");

export class SessionManager extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * List all sessions across all projects
   */
  async listSessions(): Promise<Session[]> {
    const sessions: Session[] = [];

    if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
      return sessions;
    }

    try {
      // Iterate through project directories
      const projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR);

      for (const projectDir of projectDirs) {
        const projectPath = path.join(CLAUDE_PROJECTS_DIR, projectDir);
        const sessionsDir = path.join(projectPath, "sessions");

        if (!fs.existsSync(sessionsDir) || !fs.statSync(sessionsDir).isDirectory()) {
          continue;
        }

        // List session files
        const sessionFiles = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));

        for (const sessionFile of sessionFiles) {
          const sessionId = sessionFile.replace(".json", "");
          const sessionPath = path.join(sessionsDir, sessionFile);

          try {
            const stats = fs.statSync(sessionPath);
            sessions.push({
              id: sessionId,
              project: projectDir,
              createdAt: stats.birthtime,
              lastAccessedAt: stats.mtime,
            });
          } catch {
            // Skip unreadable session files
          }
        }
      }

      // Sort by last accessed (most recent first)
      sessions.sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime());

      return sessions;
    } catch (error) {
      console.error("[session] Error listing sessions:", error);
      return [];
    }
  }

  /**
   * Get a specific session
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const sessions = await this.listSessions();
    return sessions.find((s) => s.id === sessionId) || null;
  }

  /**
   * Get messages for a session
   */
  async getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
    // Find the session file
    const sessionPath = await this.findSessionPath(sessionId);

    if (!sessionPath || !fs.existsSync(sessionPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(sessionPath, "utf-8");
      const sessionData = JSON.parse(content);

      // Session file contains an array of messages
      if (Array.isArray(sessionData)) {
        return sessionData.map((msg, index) => ({
          role: msg.role || "unknown",
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString(),
          uuid: msg.uuid || `msg-${index}`,
        }));
      }

      // Or it might be an object with a messages array
      if (sessionData.messages && Array.isArray(sessionData.messages)) {
        return sessionData.messages.map((msg: Record<string, unknown>, index: number) => ({
          role: (msg.role as string) || "unknown",
          content: msg.content,
          timestamp: (msg.timestamp as string) || new Date().toISOString(),
          uuid: (msg.uuid as string) || `msg-${index}`,
        }));
      }

      return [];
    } catch (error) {
      console.error(`[session] Error reading session ${sessionId}:`, error);
      return [];
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const sessionPath = await this.findSessionPath(sessionId);

    if (!sessionPath || !fs.existsSync(sessionPath)) {
      return false;
    }

    try {
      fs.unlinkSync(sessionPath);
      this.emit("session:deleted", { sessionId });
      console.log(`[session] Deleted session: ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`[session] Error deleting session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Find the full path to a session file
   */
  private async findSessionPath(sessionId: string): Promise<string | null> {
    if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
      return null;
    }

    try {
      const projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR);

      for (const projectDir of projectDirs) {
        const sessionPath = path.join(
          CLAUDE_PROJECTS_DIR,
          projectDir,
          "sessions",
          `${sessionId}.json`
        );

        if (fs.existsSync(sessionPath)) {
          return sessionPath;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get the project directory for the current working directory
   */
  getProjectDir(workingDirectory: string): string {
    // Claude CLI uses a hash of the absolute path
    const absolutePath = path.resolve(workingDirectory);
    // Simple hash (matches Claude CLI's approach)
    let hash = 0;
    for (let i = 0; i < absolutePath.length; i++) {
      const char = absolutePath.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}
