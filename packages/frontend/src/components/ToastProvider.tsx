import { api } from "@agent-manager/convex/api"
import { useMutation } from "convex/react"
import type * as React from "react"
import { createContext, useCallback, useContext } from "react"
import { toast as sonnerToast } from "sonner"
import { Toaster } from "./ui/sonner"

type ToastType = "success" | "error" | "warning" | "info"

interface ToastOptions {
	type?: ToastType
	title: string
	message?: string | React.ReactNode
	duration?: number
	persist?: boolean
}

interface ToastContextValue {
	toast: (options: ToastOptions) => string | number
	success: (
		title: string,
		message?: string | React.ReactNode,
		options?: Partial<ToastOptions>,
	) => string | number
	error: (
		title: string,
		message?: string | React.ReactNode,
		options?: Partial<ToastOptions>,
	) => string | number
	warning: (
		title: string,
		message?: string | React.ReactNode,
		options?: Partial<ToastOptions>,
	) => string | number
	info: (
		title: string,
		message?: string | React.ReactNode,
		options?: Partial<ToastOptions>,
	) => string | number
	dismiss: (id: string | number) => void
	dismissAll: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const createNotification = useMutation(api.notifications.create)

	const toast = useCallback(
		(options: ToastOptions) => {
			const { type = "info", title, message, duration, persist } = options

			let id: string | number
			const toastOptions = {
				description: message,
				duration: duration,
			}

			switch (type) {
				case "success":
					id = sonnerToast.success(title, toastOptions)
					break
				case "error":
					id = sonnerToast.error(title, toastOptions)
					break
				case "warning":
					id = sonnerToast.warning(title, toastOptions)
					break
				default:
					id = sonnerToast.info(title, toastOptions)
					break
			}

			// Persist to Convex if requested (only for string messages)
			if (persist && typeof message === "string") {
				createNotification({
					type,
					title,
					message,
				}).catch(console.error)
			}

			return id
		},
		[createNotification],
	)

	const success = useCallback(
		(title: string, message?: string | React.ReactNode, options?: Partial<ToastOptions>) =>
			toast({ type: "success", title, message, ...options }),
		[toast],
	)

	const error = useCallback(
		(title: string, message?: string | React.ReactNode, options?: Partial<ToastOptions>) =>
			toast({ type: "error", title, message, ...options }),
		[toast],
	)

	const warning = useCallback(
		(title: string, message?: string | React.ReactNode, options?: Partial<ToastOptions>) =>
			toast({ type: "warning", title, message, ...options }),
		[toast],
	)

	const info = useCallback(
		(title: string, message?: string | React.ReactNode, options?: Partial<ToastOptions>) =>
			toast({ type: "info", title, message, ...options }),
		[toast],
	)

	const dismiss = useCallback((id: string | number) => {
		sonnerToast.dismiss(id)
	}, [])

	const dismissAll = useCallback(() => {
		sonnerToast.dismiss()
	}, [])

	return (
		<ToastContext.Provider
			value={{ toast, success, error, warning, info, dismiss, dismissAll }}
		>
			{children}
			<Toaster />
		</ToastContext.Provider>
	)
}

export function useToast(): ToastContextValue {
	const context = useContext(ToastContext)
	if (!context) {
		throw new Error("useToast must be used within a ToastProvider")
	}
	return context
}
