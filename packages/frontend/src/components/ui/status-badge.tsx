import { Badge, type BadgeProps } from "./badge";
import { cn } from "@/lib/utils";

type StatusVariant = BadgeProps["variant"];

// Status-to-variant mappings for common use cases
const statusMappings = {
  // Server statuses
  server: {
    online: "success",
    maintenance: "warning",
    offline: "destructive",
  },
  // Container statuses
  container: {
    running: "success",
    stopped: "destructive",
    restarting: "warning",
    paused: "warning",
    exited: "destructive",
  },
  // Task categories
  task: {
    done: "success",
    "in-progress": "info",
    todo: "warning",
    backlog: "secondary",
  },
  // Test statuses
  test: {
    passed: "success",
    pending: "warning",
    failed: "destructive",
  },
  // PR statuses
  pullRequest: {
    draft: "secondary",
    open: "info",
    review_requested: "warning",
    changes_requested: "destructive",
    approved: "success",
    merged: "purple",
    closed: "secondary",
  },
  // PR check statuses
  check: {
    pending: "warning",
    running: "info",
    passed: "success",
    failed: "destructive",
    skipped: "secondary",
  },
  // Webhook statuses
  webhook: {
    pending: "warning",
    processing: "info",
    processed: "success",
    failed: "destructive",
  },
  // Issue severity
  severity: {
    error: "destructive",
    warning: "warning",
    info: "info",
  },
} as const;

type StatusType = keyof typeof statusMappings;
type StatusValue<T extends StatusType> = keyof (typeof statusMappings)[T];

interface StatusBadgeProps<T extends StatusType>
  extends Omit<BadgeProps, "variant"> {
  /** The type of status being displayed (server, container, task, etc.) */
  type: T;
  /** The status value to display */
  status: StatusValue<T>;
  /** Whether to show the status text in uppercase */
  uppercase?: boolean;
  /** Whether to show the status text in capitalize */
  capitalize?: boolean;
  /** Custom mapping to override default variant mapping */
  customMapping?: Partial<Record<string, StatusVariant>>;
}

export function StatusBadge<T extends StatusType>({
  type,
  status,
  uppercase = false,
  capitalize = false,
  customMapping,
  className,
  children,
  ...props
}: StatusBadgeProps<T>) {
  const mapping = statusMappings[type] as Record<string, StatusVariant>;
  const variant =
    customMapping?.[status as string] ??
    mapping[status as string] ??
    "secondary";

  const displayText = children ?? String(status).replace(/_/g, " ");

  return (
    <Badge
      variant={variant}
      className={cn(
        uppercase && "uppercase",
        capitalize && "capitalize",
        className
      )}
      {...props}
    >
      {displayText}
    </Badge>
  );
}

// Re-export the mappings for use in custom scenarios
export { statusMappings };
export type { StatusType, StatusValue };
