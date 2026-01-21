import { v } from "convex/values"

// Task category status
export const categoryValidator = v.union(
	v.literal("backlog"),
	v.literal("todo"),
	v.literal("in-progress"),
	v.literal("done"),
)

// Server status
export const serverStatusValidator = v.union(
	v.literal("online"),
	v.literal("maintenance"),
	v.literal("offline"),
)

// Container status
export const containerStatusValidator = v.union(
	v.literal("running"),
	v.literal("stopped"),
	v.literal("restarting"),
	v.literal("paused"),
	v.literal("exited"),
)

// Pull request status
export const prStatusValidator = v.union(
	v.literal("draft"),
	v.literal("open"),
	v.literal("review_requested"),
	v.literal("changes_requested"),
	v.literal("approved"),
	v.literal("merged"),
	v.literal("closed"),
)

// PR check status
export const checkStatusValidator = v.union(
	v.literal("pending"),
	v.literal("running"),
	v.literal("passed"),
	v.literal("failed"),
	v.literal("skipped"),
)

// PR issue severity
export const issueSeverityValidator = v.union(
	v.literal("error"),
	v.literal("warning"),
	v.literal("info"),
)

// Test status
export const testStatusValidator = v.union(
	v.literal("passed"),
	v.literal("pending"),
	v.literal("failed"),
)

// Chat message sender
export const senderValidator = v.union(v.literal("ai"), v.literal("user"))

// Webhook source
export const webhookSourceValidator = v.union(
	v.literal("github"),
	v.literal("cicd"),
	v.literal("agent"),
	v.literal("tailscale"),
)

// Webhook status
export const webhookStatusValidator = v.union(
	v.literal("pending"),
	v.literal("processing"),
	v.literal("processed"),
	v.literal("failed"),
)

// Notification type
export const notificationTypeValidator = v.union(
	v.literal("success"),
	v.literal("error"),
	v.literal("warning"),
	v.literal("info"),
)

// Task phase - lifecycle phases for a task
export const taskPhaseValidator = v.union(
	v.literal("requirements"),
	v.literal("planning"),
	v.literal("implementation"),
	v.literal("ai_review"),
	v.literal("remediation"),
	v.literal("human_review"),
	v.literal("merge"),
)

// Remediation trigger - which review phase triggered remediation
export const remediationTriggerValidator = v.union(
	v.literal("ai_review"),
	v.literal("human_review"),
)

// Phase status - status of an individual phase execution
export const phaseStatusValidator = v.union(
	v.literal("pending"),
	v.literal("in_progress"),
	v.literal("completed"),
	v.literal("failed"),
	v.literal("skipped"),
)

// Permission mode - Claude Code permission modes
export const permissionModeValidator = v.union(
	v.literal("default"),
	v.literal("plan"),
	v.literal("accept_edits"),
	v.literal("full_auto"),
)

// PR detected via - how a PR was detected
export const prDetectedViaValidator = v.union(
	v.literal("webhook"),
	v.literal("agent"),
	v.literal("manual"),
)
