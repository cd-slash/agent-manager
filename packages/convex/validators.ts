import { v } from "convex/values";

// Task category status
export const categoryValidator = v.union(
  v.literal("backlog"),
  v.literal("todo"),
  v.literal("in-progress"),
  v.literal("done")
);

// Server status
export const serverStatusValidator = v.union(
  v.literal("online"),
  v.literal("maintenance"),
  v.literal("offline")
);

// Container status
export const containerStatusValidator = v.union(
  v.literal("running"),
  v.literal("stopped"),
  v.literal("restarting"),
  v.literal("paused"),
  v.literal("exited")
);

// Pull request status
export const prStatusValidator = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("review_requested"),
  v.literal("changes_requested"),
  v.literal("approved"),
  v.literal("merged"),
  v.literal("closed")
);

// PR check status
export const checkStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("passed"),
  v.literal("failed"),
  v.literal("skipped")
);

// PR issue severity
export const issueSeverityValidator = v.union(
  v.literal("error"),
  v.literal("warning"),
  v.literal("info")
);

// Test status
export const testStatusValidator = v.union(
  v.literal("passed"),
  v.literal("pending"),
  v.literal("failed")
);

// Chat message sender
export const senderValidator = v.union(v.literal("ai"), v.literal("user"));

// Webhook source
export const webhookSourceValidator = v.union(
  v.literal("github"),
  v.literal("cicd"),
  v.literal("agent")
);

// Webhook status
export const webhookStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("processed"),
  v.literal("failed")
);
