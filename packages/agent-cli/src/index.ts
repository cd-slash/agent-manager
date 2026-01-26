#!/usr/bin/env bun
/**
 * Agent CLI Tools
 *
 * A CLI tool for Claude agents running in containers to interact with
 * the Convex database. Provides commands for managing tasks, requirements,
 * notes, projects, dependencies, and phases.
 *
 * Usage:
 *   code-agent-tools <command> <subcommand> [options]
 *
 * Environment:
 *   CONVEX_URL - Required. The Convex deployment URL.
 *
 * All output is JSON for easy parsing.
 */

import { Command } from "commander"
import { registerTaskCommands } from "./commands/task"
import { registerRequirementsCommands } from "./commands/requirements"
import { registerNotesCommands } from "./commands/notes"
import { registerProjectCommands } from "./commands/project"
import { registerDepsCommands } from "./commands/deps"
import { registerPhaseCommands } from "./commands/phase"
import { error } from "./utils/output"

const program = new Command()

program
	.name("code-agent-tools")
	.description("CLI tools for Claude agents to interact with the task management database")
	.version("0.1.0")

// Register all command groups
registerTaskCommands(program)
registerRequirementsCommands(program)
registerNotesCommands(program)
registerProjectCommands(program)
registerDepsCommands(program)
registerPhaseCommands(program)

// Global error handling for missing CONVEX_URL (checked when commands run)
// and for unknown commands
program.on("command:*", () => {
	error(`Unknown command: ${program.args.join(" ")}. Use --help for available commands.`)
})

// Parse and execute
program.parse(process.argv)

// If no command was provided, show help
if (process.argv.length <= 2) {
	program.help()
}
