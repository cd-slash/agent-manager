import { useEffect, useRef, useState } from "react"

type SaveFn<T> = (value: T) => Promise<void>

interface UseDebouncedSaveOptions<T> {
	value: T
	savedValue: T | undefined
	onSave: SaveFn<T>
	onError?: (error: unknown) => void
	delay?: number
	enabled?: boolean
}

interface UseDebouncedSaveResult {
	isSaving: boolean
}

/**
 * Hook for debounced auto-save with optimistic UI
 *
 * Automatically saves a value after a delay when it changes from the saved value.
 * Handles loading states and error callbacks.
 *
 * @example
 * const { isSaving } = useDebouncedSave({
 *   value: inputValue,
 *   savedValue: configFromServer?.url,
 *   onSave: async (val) => await saveConfig({ url: val }),
 *   onError: (err) => toast.error("Save failed", err.message),
 *   enabled: isInitialized,
 * })
 */
export function useDebouncedSave<T>({
	value,
	savedValue,
	onSave,
	onError,
	delay = 500,
	enabled = true,
}: UseDebouncedSaveOptions<T>): UseDebouncedSaveResult {
	const [isSaving, setIsSaving] = useState(false)
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		if (!enabled) return

		// Clear any existing timeout
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current)
		}

		// Don't save if value matches saved value
		if (value === savedValue) return

		// Handle empty strings vs undefined
		if (value === "" && savedValue === undefined) return
		if (value === undefined && savedValue === "") return

		timeoutRef.current = setTimeout(async () => {
			setIsSaving(true)
			try {
				await onSave(value)
			} catch (error) {
				onError?.(error)
			} finally {
				setIsSaving(false)
			}
		}, delay)

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
			}
		}
	}, [value, savedValue, onSave, onError, delay, enabled])

	return { isSaving }
}
