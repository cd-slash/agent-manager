/**
 * Test Setup for Bun
 *
 * Convex-test requires modules to be provided explicitly when not using Vite.
 * This setup creates the modules object using Bun's native Glob API.
 */

import { resolve } from "node:path"
import { Glob } from "bun"
import type { GenericSchema } from "convex/server"
import { convexTest as baseConvexTest } from "convex-test"

// Cache the modules so we only scan once
let cachedModules: Record<string, () => Promise<unknown>> | null = null

async function loadModules(): Promise<Record<string, () => Promise<unknown>>> {
	if (cachedModules) return cachedModules

	const convexDir = resolve(import.meta.dir, "../convex")
	const glob = new Glob("**/*.ts")
	const modules: Record<string, () => Promise<unknown>> = {}

	for await (const file of glob.scan(convexDir)) {
		// Skip test files only - we need _generated files for convex-test to find the root
		if (file.includes("__tests__/")) {
			continue
		}

		const fullPath = resolve(convexDir, file)
		// Key should be relative path like "./schema.ts" or "./_generated/api.ts"
		const key = `./${file}`

		modules[key] = () => import(fullPath)
	}

	cachedModules = modules
	return modules
}

/**
 * Create a convex test instance with modules pre-loaded
 */
export async function createConvexTest<Schema extends GenericSchema>(
	schema: Schema,
) {
	const modules = await loadModules()
	return baseConvexTest(schema, modules)
}

/**
 * Synchronous wrapper that loads modules on first use
 * Note: This requires modules to be pre-loaded before tests run
 */
export function convexTestSync<Schema extends GenericSchema>(schema: Schema) {
	if (!cachedModules) {
		throw new Error(
			"Modules not loaded. Call loadModules() before running tests.",
		)
	}
	return baseConvexTest(schema, cachedModules)
}

// Pre-load modules when this file is imported
export const modulesPromise = loadModules()
