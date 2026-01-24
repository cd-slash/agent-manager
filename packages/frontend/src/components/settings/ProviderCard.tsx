import { api } from "@agent-manager/convex/api"
import { useMutation, useQuery } from "convex/react"
import {
	Bot,
	Check,
	ChevronDown,
	ChevronUp,
	ExternalLink,
	Eye,
	EyeOff,
	Link2,
	Link2Off,
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

	// API key state
	const [apiKey, setApiKey] = useState("")
	const [showApiKey, setShowApiKey] = useState(false)

	// OAuth state (now using Convex-driven flow)
	const [authCode, setAuthCode] = useState("")

	// Manual token state (alternative to OAuth flow)
	const [manualToken, setManualToken] = useState("")
	const [showManualToken, setShowManualToken] = useState(false)
	const [isSavingToken, setIsSavingToken] = useState(false)

	// Model state
	const [models, setModels] = useState<AiModelConfig[]>(provider.models)

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
	const setSecret = useMutation(api.secrets.set)

	// OAuth flow (Convex-driven - gateway polls and processes)
	const activeOAuthFlow = useQuery(
		api.aiProviders.getActiveOAuthFlow,
		provider.authType === "oauth" ? { provider: provider.type } : "skip",
	)
	const requestOAuthFlow = useMutation(api.aiProviders.requestOAuthFlow)
	const submitOAuthCode = useMutation(api.aiProviders.submitOAuthCode)
	const cancelOAuthFlow = useMutation(api.aiProviders.cancelOAuthFlow)

	// Derived OAuth state from Convex
	const isOAuthPending = activeOAuthFlow?.status === "pending"
	const isOAuthStarted = activeOAuthFlow?.status === "started"
	const isOAuthCodeReceived = activeOAuthFlow?.status === "code_received"
	const isOAuthCompleting = activeOAuthFlow?.status === "completing"
	const isOAuthInProgress =
		isOAuthPending || isOAuthStarted || isOAuthCodeReceived || isOAuthCompleting
	const oauthUrl = activeOAuthFlow?.oauthUrl

	// Reset models when provider changes
	useEffect(() => {
		setModels(provider.models)
		setIsDirty(false)
	}, [provider.models])

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

	const handleCancel = () => {
		setModels(provider.models)
		setApiKey("")
		setIsDirty(false)
	}

	// OAuth flow handlers - uses Convex mutations (gateway polls and processes)
	const handleStartOAuth = async () => {
		console.log("[ProviderCard] Requesting OAuth flow via Convex...")
		try {
			await requestOAuthFlow({ provider: provider.type })
			// The gateway will poll for this request and start the OAuth flow
			// The UI will update automatically via the useQuery subscription
			toast.success("OAuth Started", "Waiting for authentication URL...")
		} catch (error) {
			console.error("[ProviderCard] OAuth request failed:", error)
			toast.error(
				"Failed to start OAuth",
				error instanceof Error ? error.message : "Unknown error",
			)
		}
	}

	// Open OAuth URL when it becomes available
	useEffect(() => {
		if (oauthUrl && isOAuthStarted) {
			console.log("[ProviderCard] Opening OAuth URL:", oauthUrl)
			window.open(oauthUrl, "_blank", "noopener,noreferrer")
		}
	}, [oauthUrl, isOAuthStarted])

	const handleCompleteOAuth = async () => {
		if (!activeOAuthFlow?._id || !authCode) return

		try {
			await submitOAuthCode({
				flowId: activeOAuthFlow._id,
				code: authCode,
			})
			setAuthCode("")
			// The gateway will poll for the code and complete the OAuth flow
			// The UI will update automatically via the useQuery subscription
			toast.success("Code Submitted", "Completing authentication...")
		} catch (error) {
			toast.error(
				"Failed to submit code",
				error instanceof Error ? error.message : "Unknown error",
			)
		}
	}

	const handleCancelOAuth = async () => {
		if (!activeOAuthFlow?._id) return

		try {
			await cancelOAuthFlow({ flowId: activeOAuthFlow._id })
			setAuthCode("")
		} catch (error) {
			toast.error(
				"Failed to cancel",
				error instanceof Error ? error.message : "Unknown error",
			)
		}
	}

	const handleDisconnect = async () => {
		// Clear the auth token by setting it to empty
		try {
			await setSecret({
				key: "ANTHROPIC_AUTH_TOKEN",
				value: "",
				description: "Anthropic OAuth token (cleared)",
			})
			toast.success("Disconnected", "Anthropic connection removed")
		} catch (error) {
			toast.error(
				"Failed to disconnect",
				error instanceof Error ? error.message : "Unknown error",
			)
		}
	}

	const handleSaveManualToken = async () => {
		if (!manualToken.trim()) return

		setIsSavingToken(true)
		try {
			await setSecret({
				key: "ANTHROPIC_AUTH_TOKEN",
				value: manualToken.trim(),
				description: "Anthropic OAuth token (manual entry)",
			})
			setManualToken("")
			toast.success("Connected", "Anthropic token saved successfully")
		} catch (error) {
			toast.error(
				"Failed to save token",
				error instanceof Error ? error.message : "Unknown error",
			)
		} finally {
			setIsSavingToken(false)
		}
	}

	const isOAuth = provider.authType === "oauth"
	const isConnected = authStatus?.hasAuth ?? false

	return (
		<div className="bg-surface border border-border rounded-lg overflow-hidden">
			<div
				role="button"
				tabIndex={0}
				className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-surface/80 transition-colors text-left"
				onClick={() => setIsExpanded(!isExpanded)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault()
						setIsExpanded(!isExpanded)
					}
				}}
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
						<div className="text-xs text-muted-foreground">
							{isOAuth ? "OAuth (Pro/Max)" : "API Key"} auth
						</div>
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
			</div>

			{isExpanded && (
				<div className="border-t border-border p-4 space-y-4 bg-background/50">
					{/* OAuth Authentication */}
					{isOAuth && (
						<div className="space-y-3">
							<Label className="text-xs text-muted-foreground uppercase font-semibold">
								Authentication
							</Label>
							{isConnected ? (
								<div className="flex items-center justify-between p-3 bg-success/10 border border-success/20 rounded-lg">
									<div className="flex items-center gap-2">
										<Link2 size={16} className="text-success" />
										<span className="text-sm text-foreground">
											Connected to Anthropic
										</span>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={handleDisconnect}
										className="text-destructive hover:text-destructive"
									>
										<Link2Off size={14} className="mr-1.5" />
										Disconnect
									</Button>
								</div>
							) : isOAuthInProgress ? (
								<div className="space-y-3 p-3 bg-muted/50 border border-border rounded-lg">
									{isOAuthPending && (
										<div className="flex items-center gap-2 text-sm text-muted-foreground">
											<RefreshCw size={14} className="animate-spin" />
											<span>Starting authentication...</span>
										</div>
									)}
									{(isOAuthStarted || isOAuthCodeReceived) && (
										<>
											<p className="text-sm text-muted-foreground">
												A new window has been opened for authentication. After
												authorizing, copy the code and paste it below.
											</p>
											<div className="flex items-center gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() => {
														if (oauthUrl) {
															window.open(
																oauthUrl,
																"_blank",
																"noopener,noreferrer",
															)
														}
													}}
													disabled={!oauthUrl}
												>
													<ExternalLink size={14} className="mr-1.5" />
													Open Auth Page
												</Button>
											</div>
											<div className="space-y-2">
												<Label>Authorization Code</Label>
												<div className="flex items-center gap-2">
													<Input
														type="text"
														placeholder="Paste the authorization code here"
														value={authCode}
														onChange={(e) => setAuthCode(e.target.value)}
														className="font-mono"
														disabled={isOAuthCodeReceived || isOAuthCompleting}
													/>
													<Button
														onClick={handleCompleteOAuth}
														disabled={
															!authCode ||
															isOAuthCodeReceived ||
															isOAuthCompleting
														}
													>
														{isOAuthCodeReceived || isOAuthCompleting ? (
															<RefreshCw size={14} className="animate-spin" />
														) : (
															"Complete"
														)}
													</Button>
												</div>
											</div>
										</>
									)}
									{isOAuthCompleting && (
										<div className="flex items-center gap-2 text-sm text-muted-foreground">
											<RefreshCw size={14} className="animate-spin" />
											<span>Completing authentication...</span>
										</div>
									)}
									<Button
										variant="ghost"
										size="sm"
										onClick={handleCancelOAuth}
										disabled={isOAuthCompleting}
									>
										Cancel
									</Button>
								</div>
							) : (
								<div className="space-y-4">
									<div className="space-y-2">
										<Button onClick={handleStartOAuth} className="w-full">
											<Link2 size={14} className="mr-2" />
											Connect with Anthropic
										</Button>
										<p className="text-xs text-muted-foreground">
											Sign in with your Anthropic Pro or Max account
										</p>
									</div>

									<div className="relative">
										<div className="absolute inset-0 flex items-center">
											<span className="w-full border-t border-border" />
										</div>
										<div className="relative flex justify-center text-xs uppercase">
											<span className="bg-background px-2 text-muted-foreground">
												Or enter token manually
											</span>
										</div>
									</div>

									<div className="space-y-2">
										<div className="relative">
											<Input
												type={showManualToken ? "text" : "password"}
												placeholder="Paste your OAuth token here"
												value={manualToken}
												onChange={(e) => setManualToken(e.target.value)}
												className="pr-10 font-mono text-sm"
												disabled={isSavingToken}
											/>
											<button
												type="button"
												onClick={() => setShowManualToken(!showManualToken)}
												className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
											>
												{showManualToken ? (
													<EyeOff size={14} />
												) : (
													<Eye size={14} />
												)}
											</button>
										</div>
										<div className="flex items-center gap-2">
											<Button
												onClick={handleSaveManualToken}
												disabled={!manualToken.trim() || isSavingToken}
												className="flex-1"
											>
												{isSavingToken ? (
													<>
														<RefreshCw
															size={14}
															className="mr-2 animate-spin"
														/>
														Saving...
													</>
												) : (
													<>
														<Save size={14} className="mr-2" />
														Save Token
													</>
												)}
											</Button>
										</div>
										<p className="text-xs text-muted-foreground">
											You can get your token by running{" "}
											<code className="bg-muted px-1 py-0.5 rounded text-[11px]">
												claude auth status
											</code>{" "}
											in a terminal
										</p>
									</div>
								</div>
							)}
						</div>
					)}

					{/* API Key Authentication */}
					{!isOAuth && (
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
					)}

					{/* Models Section */}
					<div className="space-y-3">
						<Label className="text-xs text-muted-foreground uppercase font-semibold">
							Models
						</Label>
						<div className="space-y-2">
							{models.map((model) => (
								<div
									key={model.id}
									className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
								>
									<span className="text-sm text-foreground">
										{model.name}
									</span>
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
