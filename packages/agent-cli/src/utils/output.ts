/**
 * Output formatting utilities for CLI
 *
 * All output is JSON for easy parsing by agents.
 */

export interface SuccessResponse<T = unknown> {
	success: true
	data: T
}

export interface ErrorResponse {
	success: false
	error: string
}

export type CLIResponse<T = unknown> = SuccessResponse<T> | ErrorResponse

/**
 * Output a success response and exit
 */
export function success<T>(data: T): never {
	const response: SuccessResponse<T> = {
		success: true,
		data,
	}
	console.log(JSON.stringify(response, null, 2))
	process.exit(0)
}

/**
 * Output an error response and exit
 */
export function error(message: string): never {
	const response: ErrorResponse = {
		success: false,
		error: message,
	}
	console.log(JSON.stringify(response, null, 2))
	process.exit(1)
}

/**
 * Handle unexpected errors
 */
export function handleError(err: unknown): never {
	if (err instanceof Error) {
		error(err.message)
	}
	error(String(err))
}

/**
 * Wrap an async handler with error handling
 */
export function withErrorHandler<T extends unknown[]>(
	handler: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
	return async (...args: T) => {
		try {
			await handler(...args)
		} catch (err) {
			handleError(err)
		}
	}
}
