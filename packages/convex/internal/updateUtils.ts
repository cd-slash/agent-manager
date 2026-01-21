import type { GenericDatabaseWriter, GenericDataModel } from "convex/server"

/**
 * Filters out undefined values from an object and returns the filtered entries.
 * Useful for creating partial updates where undefined values should be ignored.
 */
export function filterUndefined<T extends Record<string, unknown>>(
	updates: T,
): Partial<T> {
	const filtered: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(updates)) {
		if (value !== undefined) {
			filtered[key] = value
		}
	}
	return filtered as Partial<T>
}

/**
 * Patches a document with filtered updates and automatically sets updatedAt.
 * Filters out undefined values from the updates object before patching.
 * Uses `any` internally since this works with arbitrary Convex tables.
 */
export async function patchWithTimestamp(
	db: GenericDatabaseWriter<GenericDataModel>,
	id: string,
	updates: Record<string, unknown>,
): Promise<void> {
	const filteredUpdates = filterUndefined(updates)
	// biome-ignore lint/suspicious/noExplicitAny: Generic patch for arbitrary Convex tables
	await (db as any).patch(id, {
		...filteredUpdates,
		updatedAt: Date.now(),
	})
}
