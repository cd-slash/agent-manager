import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Clean up old metrics every 6 hours
// Removes metrics older than 7 days
crons.interval(
  "cleanup_old_metrics",
  { hours: 6 },
  internal.internal.metrics.cleanupOldMetrics,
  { olderThanDays: 7 }
);

// Retry failed webhooks every 5 minutes
// Only retries webhooks with less than 3 retry attempts
crons.interval(
  "retry_failed_webhooks",
  { minutes: 5 },
  internal.internal.webhookProcessing.retryFailedWebhooks,
  { maxRetries: 3 }
);

// Clean up old history events every 24 hours
// Removes events older than 30 days
crons.interval(
  "cleanup_old_history",
  { hours: 24 },
  internal.internal.history.cleanupOldEvents,
  { olderThanDays: 30 }
);

export default crons;
