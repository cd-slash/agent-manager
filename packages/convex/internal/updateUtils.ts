import type { GenericDatabaseWriter, GenericDataModel } from "convex/server";

/**
 * Filters out undefined values from an object and returns the filtered entries.
 * Useful for creating partial updates where undefined values should be ignored.
 */
export function filterUndefined<T extends Record<string, unknown>>(
  updates: T
): Partial<T> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      filtered[key] = value;
    }
  }
  return filtered as Partial<T>;
}

/**
 * Patches a document with filtered updates and automatically sets updatedAt.
 * Filters out undefined values from the updates object before patching.
 */
export async function patchWithTimestamp<
  DataModel extends GenericDataModel,
  TableName extends keyof DataModel["tables"] & string,
>(
  db: GenericDatabaseWriter<DataModel>,
  id: DataModel["tables"][TableName]["document"]["_id"],
  updates: Record<string, unknown>
): Promise<void> {
  const filteredUpdates = filterUndefined(updates);
  await db.patch(id, {
    ...filteredUpdates,
    updatedAt: Date.now(),
  } as Partial<DataModel["tables"][TableName]["document"]>);
}
