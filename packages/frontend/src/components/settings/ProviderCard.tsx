import { api } from "@agent-manager/convex/api"
import { useAction, useMutation, useQuery } from "convex/react"
import {
	Bot,
	Check,
	ChevronDown,
	ChevronUp,
	Eye,
	EyeOff,
	Lock,
	RefreshCw,
	Save,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { AiModelConfig, AiProviderDoc } from "@/types"

interface ProviderCardProps {
	provider: AiProviderDoc
}

export function ProviderCard({ provider }: ProviderCardProps) {
	const toast = useToast()
	const [isExpanded, setIsExpanded] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [isDirty, setIsDirty] = useState(false)
	const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
	const [lastSyncError, setLastSyncError] = useState<string | null>(null)

	// API key state
	const [apiKey, setApiKey] = useState("")
	const [showApiKey, setShowApiKey] = useState(false)

	// Model state
	const [models, setModels] = useState<AiModelConfig[]>(provider.models)
	const [baseUrl, setBaseUrl] = useState("")

	// Check auth status
	const authStatus = useQuery(api.aiProviders.getAuthStatus, {
		id: provider._id,
	})

	// Check secrets for API key providers
	const secretsList = useQuery(api.secrets.list)
	const hasApiKeyConfigured =
		provider.authType === "api_key" &&
		provider.apiKeySecretKey &&
		secretsList?.some((s) => s.key === provider.apiKeySecretKey && s.hasValue)

	// Mutations
	const toggleEnabled = useMutation(api.aiProviders.toggleEnabled)
	const updateModels = useMutation(api.aiProviders.updateModels)
	const updateOptions = useMutation(api.aiProviders.updateOptions)
	const fetchOpencodeModels = useAction(api.aiProviders.fetchOpencodeModels)
	const setSecret = useMutation(api.secrets.set)

	// Reset models when provider changes
	useEffect(() => {
		setModels(provider.models)
		setBaseUrl(
			typeof provider.options?.baseURL === "string"
				? provider.options.baseURL
				: "",
		)
		setIsDirty(false)
	}, [provider.models, provider.options])

	const handleToggleEnabled = async () => {
		try {
			await toggleEnabled({ id: provider._id })
		} catch (error) {
			toast.error(
				"Failed to toggle provider",
				error instanceof Error ? error.message : "Unknown error",
			)
		}
	}

	const handleModelToggle = (modelId: string) => {
		setModels((prev) =>
			prev.map((m) => (m.id === modelId ? { ...m, enabled: !m.enabled } : m)),
		)
		setIsDirty(true)
	}

	const handleSave = async () => {
		setIsSaving(true)
		try {
			// Save API key if provided
			if (apiKey && provider.apiKeySecretKey) {
				await setSecret({
					key: provider.apiKeySecretKey,
					value: apiKey,
					description: `${provider.name} API key`,
				})
				setApiKey("")
			}

			// Save model configuration
			await updateModels({ id: provider._id, models })

			// Save provider options
			await updateOptions({
				id: provider._id,
				options: baseUrl.trim() ? { baseURL: baseUrl.trim() } : undefined,
			})

			setIsDirty(false)
			toast.success("Saved", `${provider.name} configuration saved`)
		} catch (error) {
			toast.error(
				"Failed to save",
				error instanceof Error ? error.message : "Unknown error",
			)
		} finally {
			setIsSaving(false)
		}
	}

	useEffect(() => {
		if (provider.models.length > 0 && !lastSyncAt) {
			setLastSyncAt(provider.updatedAt)
		}
	}, [provider.models.length, provider.updatedAt, lastSyncAt])

	const handleRefreshModels = async () => {
		setIsSaving(true)
		try {
			const result = await fetchOpencodeModels({ providerId: provider._id })
			setLastSyncAt(Date.now())
			setLastSyncError(null)
			setIsDirty(false)
			toast.success(
				"Models synced",
				`Fetched ${result.count} model${result.count === 1 ? "" : "s"}`,
			)
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error"
			setLastSyncError(message)
			toast.error("Failed to sync models", message)
		} finally {
			setIsSaving(false)
		}
	}

	const handleCancel = () => {
		setModels(provider.models)
		setApiKey("")
		setBaseUrl(
			typeof provider.options?.baseURL === "string"
				? provider.options.baseURL
				: "",
		)
		setIsDirty(false)
	}
	const isConnected = authStatus?.hasAuth ?? false

	return (
		<div className="bg-surface border border-border rounded-lg overflow-hidden">
			<button
				type="button"
				className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-surface/80 transition-colors text-left"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<div className="flex items-center gap-3">
					<Bot size={18} className="text-muted-foreground" />
					<div>
						<div className="flex items-center gap-2">
							<span className="font-medium text-foreground">
								{provider.name}
							</span>
							{provider.isBuiltin && (
								<span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
									BUILTIN
								</span>
							)}
							{isConnected && (
								<span className="text-[10px] px-1.5 py-0.5 bg-success/20 rounded text-success flex items-center gap-1">
									<Check size={10} />
									Connected
								</span>
							)}
						</div>
						<div className="text-xs text-muted-foreground">API Key auth</div>
					</div>
				</div>
				<div className="flex items-center gap-3">
					{/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation only */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only */}
					<div
						className="flex items-center gap-2"
						onClick={(e) => e.stopPropagation()}
					>
						<Switch
							checked={provider.enabled}
							onCheckedChange={handleToggleEnabled}
						/>
						<span className="text-xs text-muted-foreground">
							{provider.enabled ? "Enabled" : "Disabled"}
						</span>
					</div>
					{isExpanded ? (
						<ChevronUp size={18} className="text-muted-foreground" />
					) : (
						<ChevronDown size={18} className="text-muted-foreground" />
					)}
				</div>
			</button>

			{isExpanded && (
				<div className="border-t border-border p-4 space-y-4 bg-background/50">
					<div className="space-y-4">
						<div className="space-y-2">
							<Label className="text-xs text-muted-foreground uppercase font-semibold">
								Provider Endpoint
							</Label>
							<Input
								type="text"
								placeholder="https://api.openai.com/v1"
								value={baseUrl}
								onChange={(e) => {
									setBaseUrl(e.target.value)
									setIsDirty(true)
								}}
							/>
							<p className="text-xs text-muted-foreground">
								Optional base URL for OpenAI-compatible providers.
							</p>
						</div>
						<div className="space-y-2">
							<Label className="text-xs text-muted-foreground uppercase font-semibold">
								API Key
							</Label>
							<div className="relative">
								<Input
									type={showApiKey ? "text" : "password"}
									placeholder={
										hasApiKeyConfigured
											? "••••••••••••••••"
											: `Enter ${provider.name} API key`
									}
									value={apiKey}
									onChange={(e) => {
										setApiKey(e.target.value)
										setIsDirty(true)
									}}
									className="pr-16"
								/>
								<div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
									<button
										type="button"
										onClick={() => setShowApiKey(!showApiKey)}
										className="text-muted-foreground hover:text-foreground transition-colors"
									>
										{showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
									</button>
									<Lock size={14} className="text-muted-foreground" />
								</div>
							</div>
							<p className="text-xs text-muted-foreground">
								{hasApiKeyConfigured
									? "API key is configured. Enter a new key to update it."
									: `Enter your ${provider.name} API key`}
							</p>
						</div>
					</div>

					{/* Models Section */}
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<Label className="text-xs text-muted-foreground uppercase font-semibold">
								Models
							</Label>
							<Button
								variant="outline"
								size="sm"
								onClick={handleRefreshModels}
								disabled={isSaving}
							>
								<RefreshCw size={12} className="mr-1" />
								Refresh
							</Button>
						</div>
						{lastSyncAt && (
							<div className="text-[10px] text-muted-foreground">
								Last synced {new Date(lastSyncAt).toLocaleTimeString()}
							</div>
						)}
						{lastSyncError && (
							<div className="text-[10px] text-destructive">
								Sync error: {lastSyncError}
							</div>
						)}
						<div className="space-y-2">
							{models.map((model) => (
								<div
									key={model.id}
									className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
								>
									<span className="text-sm text-foreground">{model.name}</span>
									<Switch
										checked={model.enabled}
										onCheckedChange={() => handleModelToggle(model.id)}
									/>
								</div>
							))}
						</div>
					</div>

					{/* Actions */}
					<div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
						<Button
							variant="outline"
							onClick={handleCancel}
							disabled={!isDirty || isSaving}
						>
							Cancel
						</Button>
						<Button onClick={handleSave} disabled={!isDirty || isSaving}>
							{isSaving ? (
								<>
									<RefreshCw size={14} className="mr-2 animate-spin" />
									Saving...
								</>
							) : (
								<>
									<Save size={14} className="mr-2" />
									Save
								</>
							)}
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
