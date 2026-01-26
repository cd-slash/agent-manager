/**
 * Convex client setup for CLI
 *
 * Uses the CONVEX_URL environment variable for connection.
 */

import { api } from "@agent-manager/convex/api"
import { ConvexHttpClient } from "convex/browser"
import { error } from "./utils/output"

let clientInstance: ConvexHttpClient | null = null

/**
 * Get the Convex client instance
 * Creates a singleton client using CONVEX_URL from environment
 */
export function getClient(): ConvexHttpClient {
	if (clientInstance) {
		return clientInstance
	}

	const convexUrl = process.env.CONVEX_URL
	if (!convexUrl) {
		error("CONVEX_URL environment variable is required")
	}

	clientInstance = new ConvexHttpClient(convexUrl)
	return clientInstance
}

/**
 * Export the API for typed queries/mutations
 */
export { api }

/**
 * Types for common Convex IDs
 */
export type TaskId = string
export type ProjectId = string
export type AcceptanceCriteriaId = string
