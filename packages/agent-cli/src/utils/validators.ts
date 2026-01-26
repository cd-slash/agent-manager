/**
 * Input validation helpers
 */

import { error } from "./output"

// Convex ID format: starts with a letter, followed by alphanumeric characters
// Example: j572qwy5e9t6kh3pqzqz82qqm56h7jvp
const CONVEX_ID_PATTERN = /^[a-z][a-z0-9]+$/

/**
 * Validate a Convex document ID
 */
export function validateId(id: string | undefined, fieldName: string): string {
	if (!id) {
		error(`${fieldName} is required`)
	}
	// Convex IDs can vary in format, so we just check it's not empty
	// The actual validation will happen when we try to use it
	if (id.trim().length === 0) {
		error(`${fieldName} cannot be empty`)
	}
	return id
}

/**
 * Validate task category
 */
export function validateCategory(
	category: string | undefined,
): "backlog" | "todo" | "in-progress" | "done" {
	const validCategories = ["backlog", "todo", "in-progress", "done"] as const
	if (!category || !validCategories.includes(category as typeof validCategories[number])) {
		error(`Invalid category. Must be one of: ${validCategories.join(", ")}`)
	}
	return category as "backlog" | "todo" | "in-progress" | "done"
}

/**
 * Validate a required string
 */
export function validateRequired(
	value: string | undefined,
	fieldName: string,
): string {
	if (!value || value.trim().length === 0) {
		error(`${fieldName} is required`)
	}
	return value
}

/**
 * Validate a boolean value from string
 */
export function validateBoolean(
	value: string | undefined,
	fieldName: string,
): boolean {
	if (value === undefined) {
		error(`${fieldName} is required`)
	}
	if (value === "true" || value === "1") return true
	if (value === "false" || value === "0") return false
	error(`${fieldName} must be true or false`)
}

/**
 * Parse JSON array from string
 */
export function parseJsonArray(value: string | undefined, fieldName: string): string[] {
	if (!value) {
		error(`${fieldName} is required`)
	}
	try {
		const parsed = JSON.parse(value)
		if (!Array.isArray(parsed)) {
			error(`${fieldName} must be a JSON array`)
		}
		return parsed.map(String)
	} catch {
		error(`${fieldName} must be valid JSON`)
	}
}

/**
 * Validate optional number
 */
export function validateNumber(
	value: string | undefined,
	fieldName: string,
): number | undefined {
	if (value === undefined) return undefined
	const num = Number(value)
	if (Number.isNaN(num)) {
		error(`${fieldName} must be a number`)
	}
	return num
}
