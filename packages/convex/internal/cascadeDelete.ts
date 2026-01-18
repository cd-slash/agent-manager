import type { GenericDatabaseWriter, GenericDataModel } from "convex/server";
import type { Id } from "../_generated/dataModel";

type DatabaseWriter = GenericDatabaseWriter<GenericDataModel>;

/**
 * Deletes all records from a table that match a given index query.
 */
async function deleteByIndex<TableName extends string>(
  db: DatabaseWriter,
  table: TableName,
  index: string,
  field: string,
  value: Id<string>
): Promise<number> {
  const records = await (db as DatabaseWriter)
    .query(table)
    .withIndex(index, (q: { eq: (field: string, value: Id<string>) => unknown }) =>
      q.eq(field, value)
    )
    .collect();

  for (const record of records) {
    await db.delete(record._id);
  }

  return records.length;
}

/**
 * Deletes all task-related data for a given task ID.
 * This includes: dependencies, acceptance criteria, tests, chat messages, history events.
 */
export async function deleteTaskRelatedData(
  db: DatabaseWriter,
  taskId: Id<"tasks">
): Promise<void> {
  // Delete dependencies where this task is the dependent
  await deleteByIndex(db, "taskDependencies", "by_task", "taskId", taskId);

  // Delete dependencies where this task is depended upon
  await deleteByIndex(
    db,
    "taskDependencies",
    "by_depends_on",
    "dependsOnTaskId",
    taskId
  );

  // Delete acceptance criteria
  await deleteByIndex(db, "acceptanceCriteria", "by_task", "taskId", taskId);

  // Delete tests
  await deleteByIndex(db, "tests", "by_task", "taskId", taskId);

  // Delete chat messages
  await deleteByIndex(db, "chatMessages", "by_task", "taskId", taskId);

  // Delete history events
  await deleteByIndex(db, "historyEvents", "by_task", "taskId", taskId);
}

/**
 * Deletes all PR-related data for a given pull request ID.
 * This includes: comments, issues, checks.
 */
export async function deletePRRelatedData(
  db: DatabaseWriter,
  pullRequestId: Id<"pullRequests">
): Promise<void> {
  // Delete PR comments
  await deleteByIndex(
    db,
    "prComments",
    "by_pull_request",
    "pullRequestId",
    pullRequestId
  );

  // Delete PR issues
  await deleteByIndex(
    db,
    "prIssues",
    "by_pull_request",
    "pullRequestId",
    pullRequestId
  );

  // Delete PR checks
  await deleteByIndex(
    db,
    "prChecks",
    "by_pull_request",
    "pullRequestId",
    pullRequestId
  );
}

/**
 * Deletes a task and all its related data including pull requests.
 */
export async function deleteTaskCascade(
  db: DatabaseWriter,
  taskId: Id<"tasks">
): Promise<void> {
  // Delete task-related data
  await deleteTaskRelatedData(db, taskId);

  // Delete pull requests and their related data
  const pullRequests = await db
    .query("pullRequests")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();

  for (const pr of pullRequests) {
    await deletePRRelatedData(db, pr._id);
    await db.delete(pr._id);
  }

  // Finally delete the task
  await db.delete(taskId);
}

/**
 * Deletes a project and all its related data including tasks.
 */
export async function deleteProjectCascade(
  db: DatabaseWriter,
  projectId: Id<"projects">
): Promise<void> {
  // Delete all related tasks first
  const tasks = await db
    .query("tasks")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  for (const task of tasks) {
    // Delete task-related data (without deleting PR related data as the task deletion handles it)
    await deleteTaskRelatedData(db, task._id);
    await db.delete(task._id);
  }

  // Delete project-level chat messages
  await deleteByIndex(db, "chatMessages", "by_project", "projectId", projectId);

  // Delete project-level history events
  await deleteByIndex(db, "historyEvents", "by_project", "projectId", projectId);

  // Finally delete the project
  await db.delete(projectId);
}

/**
 * Deletes a server and all its related data including containers and metrics.
 */
export async function deleteServerCascade(
  db: DatabaseWriter,
  serverId: Id<"servers">
): Promise<void> {
  // Delete containers
  await deleteByIndex(db, "containers", "by_server", "serverId", serverId);

  // Delete metrics history
  const metrics = await db
    .query("serverMetrics")
    .withIndex("by_server_and_timestamp", (q) => q.eq("serverId", serverId))
    .collect();

  for (const metric of metrics) {
    await db.delete(metric._id);
  }

  // Finally delete the server
  await db.delete(serverId);
}
