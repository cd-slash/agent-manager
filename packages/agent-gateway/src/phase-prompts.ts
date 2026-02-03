/**
 * Phase Prompt Templates
 *
 * Generates prompts for each task phase based on task context.
 */

/**
 * CLI Tools Documentation
 *
 * This documentation is included in prompts to help agents use the CLI tools.
 */
const CLI_TOOLS_DOCUMENTATION = `
## Agent CLI Tools

You have access to the \`code-agent-tools\` CLI for interacting with the task management database.
All commands output JSON for easy parsing.

### Requirements Management
\`\`\`bash
# List acceptance criteria
code-agent-tools requirements list --task-id <task-id>

# Add a requirement
code-agent-tools requirements add --task-id <task-id> --text "User can login with email"

# Add multiple requirements
code-agent-tools requirements add-bulk --task-id <task-id> --items '["Req 1", "Req 2"]'

# Mark requirement as done
code-agent-tools requirements set-done <criteria-id> --done true

# Delete a requirement
code-agent-tools requirements delete <criteria-id>
\`\`\`

### Notes/Chat
\`\`\`bash
# Add a note to the task (for findings, decisions, questions)
code-agent-tools notes add --task-id <task-id> --text "Found that auth module needs refactoring"

# List notes for the task
code-agent-tools notes list --task-id <task-id>
\`\`\`

### Task Information
\`\`\`bash
# Get task details
code-agent-tools task get <task-id>

# List tasks in project
code-agent-tools task list --project-id <project-id>

# Update task fields
code-agent-tools task update <task-id> --description "Updated description"
\`\`\`

### Dependencies
\`\`\`bash
# List task dependencies
code-agent-tools deps list --task-id <task-id>

# Check what tasks this one blocks
code-agent-tools deps blocked-by --task-id <task-id>
\`\`\`

### Phase Information (read-only)
\`\`\`bash
# Get current phase details
code-agent-tools phase current --task-id <task-id>

# List all phases with status
code-agent-tools phase list --task-id <task-id>
\`\`\`

Use these tools to update task state, add notes about your findings, and mark requirements as complete.
`

export type TaskPhase =
	| "requirements"
	| "planning"
	| "implementation"
	| "ai_review"
	| "remediation"
	| "human_review"
	| "merge"

export interface TaskContext {
	/** Task title */
	title: string
	/** Task description */
	description: string
	/** Custom prompt/instructions */
	prompt?: string
	/** Repository name (owner/repo) */
	repo: string
	/** Git branch */
	branch: string
	/** Acceptance criteria */
	acceptanceCriteria?: Array<{ text: string; completed: boolean }>
	/** Tests to run */
	tests?: Array<{ name: string; command?: string }>
	/** Pull request info (for review/remediation phases) */
	pullRequest?: {
		number: number
		url: string
		branch: string
	}
	/** Issues found during review (for remediation phase) */
	issues?: Array<{
		title: string
		description: string
		severity: string
		filePath?: string
		lineNumber?: number
	}>
	/** Feedback from human review (for remediation phase) */
	humanFeedback?: string
	/** Planning phase output (for implementation phase) */
	planningOutput?: string
	/** Implementation notes */
	implementationNotes?: string
}

export interface PhasePromptConfig {
	/** Model to use (deprecated) */
	model?: "sonnet" | "opus" | "haiku"
	/** OpenCode provider ID */
	providerId?: string
	/** OpenCode model ID */
	modelId?: string
	/** Permission mode */
	permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan"
	/** System prompt override */
	systemPrompt?: string
	/** Append to system prompt */
	appendSystemPrompt?: string
	/** Allowed tools */
	allowedTools?: string[]
	/** Disallowed tools */
	disallowedTools?: string[]
	/** Max budget in USD */
	maxBudget?: number
}

export interface GeneratedPrompt {
	/** The main prompt message */
	message: string
	/** Configuration for the execution */
	config: PhasePromptConfig
}

/**
 * Generate prompt for a specific task phase
 */
export function generatePhasePrompt(
	phase: TaskPhase,
	context: TaskContext,
): GeneratedPrompt {
	switch (phase) {
		case "requirements":
			return generateRequirementsPrompt(context)
		case "planning":
			return generatePlanningPrompt(context)
		case "implementation":
			return generateImplementationPrompt(context)
		case "ai_review":
			return generateAiReviewPrompt(context)
		case "remediation":
			return generateRemediationPrompt(context)
		case "human_review":
			return generateHumanReviewPrompt(context)
		case "merge":
			return generateMergePrompt(context)
		default:
			throw new Error(`Unknown phase: ${phase}`)
	}
}

/**
 * Requirements phase - analyze and clarify requirements
 */
function generateRequirementsPrompt(context: TaskContext): GeneratedPrompt {
	const message = `# Task: ${context.title}

## Description
${context.description}

${context.prompt ? `## Additional Instructions\n${context.prompt}\n` : ""}

## Your Role
You are a requirements analyst. Your job is to:

1. **Analyze** the task requirements thoroughly
2. **Identify** any ambiguities or missing information
3. **Suggest** acceptance criteria if not provided
4. **Clarify** the scope and boundaries of the task
5. **List** any dependencies or prerequisites

## Context
- Repository: ${context.repo}
- Branch: ${context.branch}

## Output
Provide a clear summary of:
1. What needs to be done
2. What success looks like
3. Any questions or clarifications needed
4. Suggested acceptance criteria

**IMPORTANT**: After your analysis, use the CLI tools to:
- Add suggested acceptance criteria using \`code-agent-tools requirements add-bulk\`
- Add notes about any important findings or questions

Do NOT write any code yet. Focus only on understanding and documenting the requirements.
${CLI_TOOLS_DOCUMENTATION}`

	return {
		message,
		config: {
			model: "sonnet",
			permissionMode: "plan",
			maxBudget: 0.5,
		},
	}
}

/**
 * Planning phase - design the implementation approach
 */
function generatePlanningPrompt(context: TaskContext): GeneratedPrompt {
	const acceptanceCriteriaText =
		context.acceptanceCriteria && context.acceptanceCriteria.length > 0
			? context.acceptanceCriteria.map((ac) => `- ${ac.text}`).join("\n")
			: "No specific acceptance criteria provided."

	const message = `# Task: ${context.title}

## Description
${context.description}

${context.prompt ? `## Additional Instructions\n${context.prompt}\n` : ""}

## Acceptance Criteria
${acceptanceCriteriaText}

## Your Role
You are a software architect. Your job is to:

1. **Explore** the codebase to understand the existing architecture
2. **Identify** the files that need to be modified or created
3. **Design** a step-by-step implementation plan
4. **Consider** edge cases, error handling, and testing
5. **Document** any risks or technical decisions

## Context
- Repository: ${context.repo}
- Branch: ${context.branch}

## Instructions
1. Use the available tools to read and explore the codebase
2. Understand the patterns and conventions used
3. Create a detailed implementation plan

## Output Format
Provide:
1. **Files to Modify**: List each file with what changes are needed
2. **New Files**: List any new files to create
3. **Implementation Steps**: Numbered list of concrete steps
4. **Testing Strategy**: How to verify the implementation
5. **Risks/Considerations**: Any concerns or alternatives

**IMPORTANT**: Use the CLI tools to:
- Add notes about architectural decisions using \`code-agent-tools notes add\`
- Refine acceptance criteria if needed using the requirements commands
- Check task dependencies using \`code-agent-tools deps list\`

Do NOT write implementation code yet. Focus on planning.
${CLI_TOOLS_DOCUMENTATION}`

	return {
		message,
		config: {
			model: "sonnet",
			permissionMode: "plan",
			maxBudget: 2.0,
		},
	}
}

/**
 * Implementation phase - write the code
 */
function generateImplementationPrompt(context: TaskContext): GeneratedPrompt {
	const acceptanceCriteriaText =
		context.acceptanceCriteria && context.acceptanceCriteria.length > 0
			? context.acceptanceCriteria.map((ac) => `- ${ac.text}`).join("\n")
			: "No specific acceptance criteria provided."

	const planningText = context.planningOutput
		? `## Implementation Plan (from planning phase)\n${context.planningOutput}\n`
		: ""

	const message = `# Task: ${context.title}

## Description
${context.description}

${context.prompt ? `## Additional Instructions\n${context.prompt}\n` : ""}

## Acceptance Criteria
${acceptanceCriteriaText}

${planningText}

## Your Role
You are a senior software engineer. Your job is to:

1. **Implement** the task according to the requirements and plan
2. **Follow** existing code patterns and conventions
3. **Write** clean, maintainable, well-documented code
4. **Create** or update tests as needed
5. **Commit** your changes with clear commit messages

## Context
- Repository: ${context.repo}
- Branch: ${context.branch}

## Instructions
1. Create a new feature branch from ${context.branch}
2. Implement the required changes
3. Run existing tests to ensure nothing breaks
4. Add new tests if appropriate
5. Commit your changes with descriptive messages
6. Push the branch and create a pull request

## Code Quality Requirements
- Follow the existing code style and patterns
- Add appropriate error handling
- Include comments for complex logic
- Ensure type safety (if TypeScript)
- Do not introduce security vulnerabilities

## Output
After completing the implementation:
1. Summarize what was implemented
2. List all files modified/created
3. Describe any decisions made during implementation
4. Note any concerns or follow-up items

**IMPORTANT**: As you implement, use the CLI tools to:
- Mark acceptance criteria as done when implemented: \`code-agent-tools requirements set-done <id> --done true\`
- Add notes about implementation decisions: \`code-agent-tools notes add --task-id <task-id> --text "..."\`
- Check your progress: \`code-agent-tools requirements list --task-id <task-id>\`
${CLI_TOOLS_DOCUMENTATION}`

	return {
		message,
		config: {
			model: "sonnet",
			permissionMode: "acceptEdits",
			maxBudget: 10.0,
		},
	}
}

/**
 * AI Review phase - review the implementation
 */
function generateAiReviewPrompt(context: TaskContext): GeneratedPrompt {
	const prInfo = context.pullRequest
		? `## Pull Request\n- PR #${context.pullRequest.number}\n- URL: ${context.pullRequest.url}\n- Branch: ${context.pullRequest.branch}\n`
		: ""

	const acceptanceCriteriaText =
		context.acceptanceCriteria && context.acceptanceCriteria.length > 0
			? context.acceptanceCriteria.map((ac) => `- ${ac.text}`).join("\n")
			: "No specific acceptance criteria provided."

	const message = `# Code Review: ${context.title}

## Original Task Description
${context.description}

## Acceptance Criteria
${acceptanceCriteriaText}

${prInfo}

## Your Role
You are a senior code reviewer. Your job is to:

1. **Review** all changes in the pull request
2. **Verify** the implementation meets the acceptance criteria
3. **Check** for bugs, security issues, and code quality problems
4. **Identify** any missing tests or edge cases
5. **Provide** constructive feedback

## Review Checklist
- [ ] Code correctness - Does it work as intended?
- [ ] Code quality - Is it clean, readable, and maintainable?
- [ ] Error handling - Are errors handled appropriately?
- [ ] Security - Are there any security vulnerabilities?
- [ ] Performance - Are there any performance concerns?
- [ ] Testing - Are there adequate tests?
- [ ] Documentation - Is the code well-documented?
- [ ] Style - Does it follow project conventions?

## Context
- Repository: ${context.repo}
- Branch: ${context.branch}

## Instructions
1. Read the diff of all changed files
2. Understand what was implemented
3. Verify against acceptance criteria
4. Look for issues and improvements

## Output Format
Provide:
1. **Summary**: Brief overview of the changes
2. **Acceptance Criteria Status**: Check each criterion
3. **Issues Found**: List any problems (with severity: critical, major, minor, suggestion)
4. **Recommendations**: Suggestions for improvement
5. **Verdict**: APPROVE, REQUEST_CHANGES, or NEEDS_DISCUSSION`

	return {
		message,
		config: {
			model: "sonnet",
			permissionMode: "plan", // Read-only for review
			maxBudget: 3.0,
		},
	}
}

/**
 * Remediation phase - fix issues from review
 */
function generateRemediationPrompt(context: TaskContext): GeneratedPrompt {
	const issuesText =
		context.issues && context.issues.length > 0
			? context.issues
					.map(
						(issue, i) =>
							`### Issue ${i + 1}: ${issue.title}
- **Severity**: ${issue.severity}
- **Description**: ${issue.description}
${issue.filePath ? `- **File**: ${issue.filePath}${issue.lineNumber ? `:${issue.lineNumber}` : ""}` : ""}`,
					)
					.join("\n\n")
			: "No specific issues listed."

	const feedbackText = context.humanFeedback
		? `## Human Reviewer Feedback\n${context.humanFeedback}\n`
		: ""

	const prInfo = context.pullRequest
		? `## Pull Request\n- PR #${context.pullRequest.number}\n- Branch: ${context.pullRequest.branch}\n`
		: ""

	const message = `# Remediation: ${context.title}

## Original Task Description
${context.description}

${prInfo}

## Issues to Fix
${issuesText}

${feedbackText}

## Your Role
You are a software engineer fixing issues found during code review. Your job is to:

1. **Address** each issue identified in the review
2. **Fix** bugs, security issues, and code quality problems
3. **Add** missing tests or error handling
4. **Update** documentation if needed
5. **Commit** your fixes with clear messages

## Context
- Repository: ${context.repo}
- Branch: ${context.branch}

## Instructions
1. Review each issue carefully
2. Make the necessary fixes
3. Ensure fixes don't introduce new problems
4. Run tests to verify the fixes
5. Commit and push your changes

## Output
After completing remediation:
1. List each issue and how it was addressed
2. Describe any additional changes made
3. Note any issues that couldn't be fully resolved
4. Confirm tests are passing

**IMPORTANT**: Use the CLI tools to:
- Add notes about remediation decisions: \`code-agent-tools notes add --task-id <task-id> --text "..."\`
- Update acceptance criteria status if needed
${CLI_TOOLS_DOCUMENTATION}`

	return {
		message,
		config: {
			model: "sonnet",
			permissionMode: "acceptEdits",
			maxBudget: 5.0,
		},
	}
}

/**
 * Human Review phase - assist human reviewer
 */
function generateHumanReviewPrompt(context: TaskContext): GeneratedPrompt {
	const prInfo = context.pullRequest
		? `## Pull Request\n- PR #${context.pullRequest.number}\n- URL: ${context.pullRequest.url}\n- Branch: ${context.pullRequest.branch}\n`
		: ""

	const message = `# Assisting Human Review: ${context.title}

## Original Task Description
${context.description}

${prInfo}

## Your Role
You are an assistant helping a human reviewer test and evaluate the changes. Your job is to:

1. **Answer** questions about the implementation
2. **Run** specific tests or commands as requested
3. **Demonstrate** functionality as needed
4. **Explain** code changes and decisions
5. **Help** identify any remaining issues

## Context
- Repository: ${context.repo}
- Branch: ${context.branch}

## Instructions
You are now in an interactive session with the human reviewer.
- Respond to their questions and requests
- Run commands they ask you to run
- Help them understand and test the changes
- Be ready to make minor fixes if requested

Await the reviewer's instructions.`

	return {
		message,
		config: {
			model: "sonnet",
			permissionMode: "default", // Interactive mode
			maxBudget: 5.0,
		},
	}
}

/**
 * Merge phase - merge the approved PR
 */
function generateMergePrompt(context: TaskContext): GeneratedPrompt {
	const prInfo = context.pullRequest
		? `## Pull Request\n- PR #${context.pullRequest.number}\n- Branch: ${context.pullRequest.branch}\n`
		: ""

	const message = `# Merge: ${context.title}

## Task Description
${context.description}

${prInfo}

## Your Role
You are completing the task by merging the approved pull request. Your job is to:

1. **Verify** all checks are passing
2. **Merge** the pull request
3. **Clean up** the feature branch if appropriate
4. **Update** any related documentation or tracking

## Context
- Repository: ${context.repo}
- Target Branch: ${context.branch}

## Instructions
1. Check that all CI checks have passed
2. Verify the PR is approved
3. Merge the pull request (prefer squash merge for cleaner history)
4. Delete the feature branch
5. Confirm the merge was successful

## Output
After completing the merge:
1. Confirm the PR was merged successfully
2. Note the merge commit hash
3. Confirm the feature branch was deleted
4. Any post-merge notes or follow-up items`

	return {
		message,
		config: {
			model: "sonnet",
			permissionMode: "acceptEdits",
			maxBudget: 1.0,
		},
	}
}

/**
 * Get default config for a phase
 */
export function getPhaseDefaults(phase: TaskPhase): Partial<PhasePromptConfig> {
	switch (phase) {
		case "requirements":
			return { model: "sonnet", permissionMode: "plan", maxBudget: 0.5 }
		case "planning":
			return { model: "sonnet", permissionMode: "plan", maxBudget: 2.0 }
		case "implementation":
			return { model: "sonnet", permissionMode: "acceptEdits", maxBudget: 10.0 }
		case "ai_review":
			return { model: "sonnet", permissionMode: "plan", maxBudget: 3.0 }
		case "remediation":
			return { model: "sonnet", permissionMode: "acceptEdits", maxBudget: 5.0 }
		case "human_review":
			return { model: "sonnet", permissionMode: "default", maxBudget: 5.0 }
		case "merge":
			return { model: "sonnet", permissionMode: "acceptEdits", maxBudget: 1.0 }
		default:
			return { model: "sonnet" }
	}
}
