import { api } from "@agent-manager/convex/api"
import { useAction, useMutation, useQuery } from "convex/react"
import {
	Bell,
	Bot,
	Check,
	Container,
	Copy,
	Cpu,
	Eye,
	EyeOff,
	FileStack,
	Key,
	Lock,
	Network,
	RefreshCw,
	Server,
	Sliders,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDebouncedSave } from "@/hooks/useDebouncedSave"
import { PhaseDefaultsSettings } from "./PhaseDefaultsSettings"
import { ProvidersSettings } from "./ProvidersSettings"
import { TaskTemplatesSettings } from "./TaskTemplatesSettings"

// Gateway Configuration Section Component
function GatewayConfigSection() {
	const toast = useToast()
	const [gatewayUrl, setGatewayUrl] = useState("")
	const [defaultServer, setDefaultServer] = useState("")
	const [defaultRepo, setDefaultRepo] = useState("")
	const [initialized, setInitialized] = useState(false)

	// Convex hooks
	const gatewayConfig = useQuery(api.settings.getGatewayConfig)
	const setGatewayConfig = useMutation(api.settings.setGatewayConfig)

	// Error handler
	const handleError = useCallback(
		(field: string) => (error: unknown) => {
			toast.error(
				"Failed to save",
				error instanceof Error ? error.message : `Failed to save ${field}`,
			)
		},
		[toast],
	)

	// Auto-save hooks
	const { isSaving: savingUrl } = useDebouncedSave<string | undefined>({
		value: gatewayUrl || undefined,
		savedValue: gatewayConfig?.url,
		onSave: useCallback(
			async (val: string | undefined) => {
				await setGatewayConfig({ url: val })
			},
			[setGatewayConfig],
		),
		onError: handleError("gateway URL"),
		enabled: initialized,
	})

	const { isSaving: savingServer } = useDebouncedSave<string | undefined>({
		value: defaultServer || undefined,
		savedValue: gatewayConfig?.defaultServer ?? undefined,
		onSave: useCallback(
			async (val: string | undefined) => {
				await setGatewayConfig({ defaultServer: val })
			},
			[setGatewayConfig],
		),
		onError: handleError("default server"),
		enabled: initialized,
	})

	const { isSaving: savingRepo } = useDebouncedSave<string | undefined>({
		value: defaultRepo || undefined,
		savedValue: gatewayConfig?.defaultRepo ?? undefined,
		onSave: useCallback(
			async (val: string | undefined) => {
				await setGatewayConfig({ defaultRepo: val })
			},
			[setGatewayConfig],
		),
		onError: handleError("default repo"),
		enabled: initialized,
	})

	// Load initial values once
	useEffect(() => {
		if (gatewayConfig && !initialized) {
			setGatewayUrl(gatewayConfig.url || "")
			setDefaultServer(gatewayConfig.defaultServer || "")
			setDefaultRepo(gatewayConfig.defaultRepo || "")
			setInitialized(true)
		}
	}, [gatewayConfig, initialized])

	return (
		<section>
			<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
				<Server size={16} className="mr-2" /> Agent Gateway
			</h3>
			<div className="bg-surface border border-border rounded-lg p-4">
				<p className="text-sm text-muted-foreground mb-4">
					Configure the agent gateway for container management. The gateway
					handles communication with agent containers.
				</p>
				<div className="space-y-4 max-w-3xl">
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label>Gateway URL</Label>
							{savingUrl && (
								<span className="text-xs text-muted-foreground flex items-center gap-1">
									<RefreshCw size={10} className="animate-spin" />
									Saving...
								</span>
							)}
						</div>
						<Input
							type="text"
							placeholder="http://localhost:3100"
							value={gatewayUrl}
							onChange={(e) => setGatewayUrl(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							The URL of your agent-gateway server
						</p>
					</div>
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label>Default Server</Label>
							{savingServer && (
								<span className="text-xs text-muted-foreground flex items-center gap-1">
									<RefreshCw size={10} className="animate-spin" />
									Saving...
								</span>
							)}
						</div>
						<Input
							type="text"
							placeholder="localhost or server hostname"
							value={defaultServer}
							onChange={(e) => setDefaultServer(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Default server for creating new containers
						</p>
					</div>
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label>Default Repository</Label>
							{savingRepo && (
								<span className="text-xs text-muted-foreground flex items-center gap-1">
									<RefreshCw size={10} className="animate-spin" />
									Saving...
								</span>
							)}
						</div>
						<Input
							type="text"
							placeholder="anthropics/claude-code-sandbox"
							value={defaultRepo}
							onChange={(e) => setDefaultRepo(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Default repository for agent containers
						</p>
					</div>
				</div>
			</div>
		</section>
	)
}

export function SettingsView() {
	const [activeTab, setActiveTab] = useState("credentials")
	const toast = useToast()

	// GitHub credentials state
	const [ghUsername, setGhUsername] = useState("")
	const [ghToken, setGhToken] = useState("")

	// Visibility toggles for password fields
	const [showGhToken, setShowGhToken] = useState(false)
	const [showTailscaleApiKey, setShowTailscaleApiKey] = useState(false)
	const [showTailscaleWebhookSecret, setShowTailscaleWebhookSecret] =
		useState(false)

	// Tailscale state
	const [tailnetId, setTailnetId] = useState("")
	const [tailscaleApiKey, setTailscaleApiKey] = useState("")
	const [tailscaleWebhookSecret, setTailscaleWebhookSecret] = useState("")
	const [isSyncing, setIsSyncing] = useState(false)
	const [webhookUrlCopied, setWebhookUrlCopied] = useState(false)

	// Unified saving state for all fields
	const [savingField, setSavingField] = useState<string | null>(null)

	// Derive webhook URL from Convex URL
	const convexUrl =
		import.meta.env?.VITE_CONVEX_URL || "https://brazen-skunk-217.convex.cloud"
	const webhookUrl = `${convexUrl.replace(".convex.cloud", ".convex.site")}/webhooks/tailscale`

	const handleCopyWebhookUrl = async () => {
		await navigator.clipboard.writeText(webhookUrl)
		setWebhookUrlCopied(true)
		toast.success("Copied", "Webhook URL copied to clipboard")
		setTimeout(() => setWebhookUrlCopied(false), 2000)
	}

	// Convex hooks for Tailscale
	const tailscaleConfig = useQuery(api.settings.getTailscaleConfig)
	const setTailscaleConfig = useMutation(api.settings.setTailscaleConfig)
	const syncDevices = useAction(api.tailscale.syncDevices)

	// Convex hooks for secrets
	const secretsList = useQuery(api.secrets.list)
	const setSecret = useMutation(api.secrets.set)
	const storedGhUsername = useQuery(api.secrets.get, { key: "GH_USERNAME" })

	// Check which secrets are configured
	const hasSecret = (key: string) =>
		secretsList?.some((s) => s.key === key && s.hasValue)

	// Auto-save GitHub username
	useEffect(() => {
		if (!ghUsername) return
		// Don't save if it matches the stored value
		if (ghUsername === storedGhUsername?.value) return
		const timer = setTimeout(async () => {
			setSavingField("ghUsername")
			try {
				await setSecret({
					key: "GH_USERNAME",
					value: ghUsername,
					description: "GitHub username for repository cloning",
				})
			} catch (error) {
				toast.error(
					"Failed to save",
					error instanceof Error ? error.message : "Failed to save username",
				)
			} finally {
				setSavingField(null)
			}
		}, 500)
		return () => clearTimeout(timer)
	}, [ghUsername, storedGhUsername?.value, setSecret, toast])

	// Auto-save GitHub token
	useEffect(() => {
		if (!ghToken) return
		const timer = setTimeout(async () => {
			setSavingField("ghToken")
			try {
				await setSecret({
					key: "GH_TOKEN",
					value: ghToken,
					description: "GitHub personal access token",
				})
				setGhToken("") // Clear after saving for security
				toast.success("Saved", "GitHub token saved securely")
			} catch (error) {
				toast.error(
					"Failed to save",
					error instanceof Error ? error.message : "Failed to save token",
				)
			} finally {
				setSavingField(null)
			}
		}, 500)
		return () => clearTimeout(timer)
	}, [ghToken, setSecret, toast])

	// Auto-save Tailscale tailnet ID
	useEffect(() => {
		if (!tailnetId) return
		// Don't save if it matches stored value
		if (tailnetId === tailscaleConfig?.tailnetId) return
		const timer = setTimeout(async () => {
			setSavingField("tailnetId")
			try {
				await setTailscaleConfig({ tailnetId })
			} catch (error) {
				toast.error(
					"Failed to save",
					error instanceof Error ? error.message : "Failed to save tailnet ID",
				)
			} finally {
				setSavingField(null)
			}
		}, 500)
		return () => clearTimeout(timer)
	}, [tailnetId, tailscaleConfig?.tailnetId, setTailscaleConfig, toast])

	// Auto-save Tailscale API key
	useEffect(() => {
		if (!tailscaleApiKey) return
		const timer = setTimeout(async () => {
			setSavingField("apiKey")
			try {
				await setTailscaleConfig({ apiKey: tailscaleApiKey })
				setTailscaleApiKey("") // Clear after saving for security
				toast.success("Saved", "API key saved securely")
			} catch (error) {
				toast.error(
					"Failed to save",
					error instanceof Error ? error.message : "Failed to save API key",
				)
			} finally {
				setSavingField(null)
			}
		}, 500)
		return () => clearTimeout(timer)
	}, [tailscaleApiKey, setTailscaleConfig, toast])

	// Auto-save Tailscale webhook secret
	useEffect(() => {
		if (!tailscaleWebhookSecret) return
		const timer = setTimeout(async () => {
			setSavingField("webhookSecret")
			try {
				await setTailscaleConfig({ webhookSecret: tailscaleWebhookSecret })
				setTailscaleWebhookSecret("") // Clear after saving for security
				toast.success("Saved", "Webhook secret saved securely")
			} catch (error) {
				toast.error(
					"Failed to save",
					error instanceof Error
						? error.message
						: "Failed to save webhook secret",
				)
			} finally {
				setSavingField(null)
			}
		}, 500)
		return () => clearTimeout(timer)
	}, [tailscaleWebhookSecret, setTailscaleConfig, toast])

	const handleSyncDevices = async () => {
		setIsSyncing(true)
		try {
			await syncDevices()
			toast.success("Synced", "Devices synced successfully")
		} catch (error) {
			toast.error(
				"Sync failed",
				error instanceof Error ? error.message : "Failed to sync devices",
			)
		} finally {
			setIsSyncing(false)
		}
	}

	return (
		<div className="flex flex-col h-full bg-background animate-in fade-in duration-300">
			<div className="flex-1 flex overflow-hidden">
				<div className="flex-1 overflow-y-auto min-w-0">
					<div className="px-page pt-section shrink-0">
						<Tabs value={activeTab} onValueChange={setActiveTab}>
							<TabsList className="w-full justify-start">
								<TabsTrigger value="credentials" className="flex items-center">
									<Key size={14} className="mr-1.5" />
									Credentials
								</TabsTrigger>
								<TabsTrigger value="providers" className="flex items-center">
									<Bot size={14} className="mr-1.5" />
									Providers
								</TabsTrigger>
								<TabsTrigger value="models" className="flex items-center">
									<Cpu size={14} className="mr-1.5" />
									Model Config
								</TabsTrigger>
								<TabsTrigger value="phases" className="flex items-center">
									<Bot size={14} className="mr-1.5" />
									Phase Defaults
								</TabsTrigger>
								<TabsTrigger value="templates" className="flex items-center">
									<FileStack size={14} className="mr-1.5" />
									Templates
								</TabsTrigger>
								<TabsTrigger value="network" className="flex items-center">
									<Network size={14} className="mr-1.5" />
									Network
								</TabsTrigger>
								<TabsTrigger value="general" className="flex items-center">
									<Sliders size={14} className="mr-1.5" />
									General
								</TabsTrigger>
							</TabsList>

							<div className="py-6">
								<TabsContent value="credentials" className="!mt-0">
									<div className="space-y-8">
										<section>
											<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
												<Container size={16} className="mr-2" /> GitHub
												Credentials
											</h3>
											<div className="bg-surface border border-border rounded-lg p-4">
												<p className="text-sm text-muted-foreground mb-4">
													GitHub credentials are used to clone repositories into
													agent containers. Only required if your agents need to
													work with private repos. Stored securely in Convex.
												</p>
												<div className="space-y-4 max-w-3xl">
													<div className="space-y-2">
														<div className="flex items-center justify-between">
															<Label>GitHub Username</Label>
															{savingField === "ghUsername" && (
																<span className="text-xs text-muted-foreground flex items-center gap-1">
																	<RefreshCw
																		size={10}
																		className="animate-spin"
																	/>
																	Saving...
																</span>
															)}
															{storedGhUsername?.value &&
																savingField !== "ghUsername" && (
																	<span className="text-xs text-success flex items-center gap-1">
																		<Check size={10} />
																		Configured
																	</span>
																)}
														</div>
														<Input
															type="text"
															placeholder="your-username"
															value={
																ghUsername || storedGhUsername?.value || ""
															}
															onChange={(e) => setGhUsername(e.target.value)}
														/>
														<p className="text-xs text-muted-foreground">
															Your GitHub username for repository access
														</p>
													</div>
													<div className="space-y-2">
														<div className="flex items-center justify-between">
															<Label>GitHub Personal Access Token</Label>
															{savingField === "ghToken" && (
																<span className="text-xs text-muted-foreground flex items-center gap-1">
																	<RefreshCw
																		size={10}
																		className="animate-spin"
																	/>
																	Saving...
																</span>
															)}
															{hasSecret("GH_TOKEN") &&
																savingField !== "ghToken" && (
																	<span className="text-xs text-success flex items-center gap-1">
																		<Check size={10} />
																		Configured
																	</span>
																)}
														</div>
														<div className="relative">
															<Input
																type={showGhToken ? "text" : "password"}
																placeholder={
																	hasSecret("GH_TOKEN")
																		? "Enter new token to update..."
																		: "ghp_..."
																}
																value={ghToken}
																onChange={(e) => setGhToken(e.target.value)}
																className="pr-16"
															/>
															<div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
																<button
																	type="button"
																	onClick={() => setShowGhToken(!showGhToken)}
																	className="text-muted-foreground hover:text-foreground transition-colors"
																>
																	{showGhToken ? (
																		<EyeOff size={14} />
																	) : (
																		<Eye size={14} />
																	)}
																</button>
																<Lock
																	size={14}
																	className="text-muted-foreground"
																/>
															</div>
														</div>
														<p className="text-xs text-muted-foreground">
															Create a PAT with repo access at GitHub Settings
															&gt; Developer settings
														</p>
													</div>
												</div>
											</div>
										</section>

										<GatewayConfigSection />
									</div>
								</TabsContent>

								<TabsContent value="providers" className="!mt-0">
									<div className="space-y-8">
										<ProvidersSettings />
									</div>
								</TabsContent>

								<TabsContent value="models" className="!mt-0">
									<div className="space-y-8">
										<section>
											<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
												<Cpu size={16} className="mr-2" /> Model Defaults
											</h3>
											<div className="bg-surface border border-border rounded-lg p-4">
												<div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
													<div className="space-y-2">
														<Label>Primary Chat Model</Label>
														<Select defaultValue="gemini">
															<SelectTrigger>
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="gemini">
																	Gemini 1.5 Pro
																</SelectItem>
																<SelectItem value="gpt4">
																	GPT-4 Turbo
																</SelectItem>
																<SelectItem value="claude">
																	Claude 3 Opus
																</SelectItem>
															</SelectContent>
														</Select>
													</div>
													<div className="space-y-2">
														<Label>Coding Model</Label>
														<Select defaultValue="sonnet">
															<SelectTrigger>
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="sonnet">
																	Claude 3.5 Sonnet
																</SelectItem>
																<SelectItem value="gpt4">GPT-4</SelectItem>
															</SelectContent>
														</Select>
													</div>
													<div className="space-y-2">
														<Label>Temperature</Label>
														<input
															type="range"
															min="0"
															max="1"
															step="0.1"
															className="w-full h-2 bg-background rounded-lg appearance-none cursor-pointer"
														/>
														<div className="flex justify-between text-xs text-muted-foreground mt-1">
															<span>Precise</span>
															<span>Creative</span>
														</div>
													</div>
													<div className="space-y-2">
														<Label>Context Window</Label>
														<Select defaultValue="128k">
															<SelectTrigger>
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="128k">
																	128k Tokens
																</SelectItem>
																<SelectItem value="32k">32k Tokens</SelectItem>
															</SelectContent>
														</Select>
													</div>
												</div>
											</div>
										</section>
									</div>
								</TabsContent>

								<TabsContent value="phases" className="!mt-0">
									<div className="space-y-8">
										<PhaseDefaultsSettings />
									</div>
								</TabsContent>

								<TabsContent value="templates" className="!mt-0">
									<div className="space-y-8">
										<TaskTemplatesSettings />
									</div>
								</TabsContent>

								<TabsContent value="network" className="!mt-0">
									<div className="space-y-8">
										<section>
											<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
												<Network size={16} className="mr-2" /> Tailscale
												Integration
											</h3>
											<div className="bg-surface border border-border rounded-lg p-4">
												<p className="text-sm text-muted-foreground mb-4">
													Connect to your Tailscale network to automatically
													discover servers and agents. Devices tagged{" "}
													<code className="bg-background px-1 rounded">
														tag:code-agent-host
													</code>{" "}
													will appear as servers, and{" "}
													<code className="bg-background px-1 rounded">
														tag:code-agent
													</code>{" "}
													will appear as containers.
												</p>
												<div className="space-y-4 max-w-3xl">
													<div className="space-y-2">
														<div className="flex items-center justify-between">
															<Label>Tailnet ID</Label>
															{savingField === "tailnetId" && (
																<span className="text-xs text-muted-foreground flex items-center gap-1">
																	<RefreshCw
																		size={10}
																		className="animate-spin"
																	/>
																	Saving...
																</span>
															)}
															{tailscaleConfig?.tailnetId &&
																savingField !== "tailnetId" && (
																	<span className="text-xs text-success flex items-center gap-1">
																		<Check size={10} />
																		Configured
																	</span>
																)}
														</div>
														<Input
															type="text"
															placeholder="your-tailnet.ts.net or organization name"
															value={
																tailnetId || tailscaleConfig?.tailnetId || ""
															}
															onChange={(e) => setTailnetId(e.target.value)}
														/>
														<p className="text-xs text-muted-foreground">
															Your tailnet name or organization name from the
															Tailscale admin console
														</p>
													</div>
													<div className="space-y-2">
														<div className="flex items-center justify-between">
															<Label>API Key</Label>
															{savingField === "apiKey" && (
																<span className="text-xs text-muted-foreground flex items-center gap-1">
																	<RefreshCw
																		size={10}
																		className="animate-spin"
																	/>
																	Saving...
																</span>
															)}
															{tailscaleConfig?.hasApiKey &&
																savingField !== "apiKey" && (
																	<span className="text-xs text-success flex items-center gap-1">
																		<Check size={10} />
																		Configured
																	</span>
																)}
														</div>
														<div className="relative">
															<Input
																type={showTailscaleApiKey ? "text" : "password"}
																placeholder={
																	tailscaleConfig?.hasApiKey
																		? "Enter new key to update..."
																		: "tskey-api-..."
																}
																value={tailscaleApiKey}
																onChange={(e) =>
																	setTailscaleApiKey(e.target.value)
																}
																className="pr-16"
															/>
															<div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
																<button
																	type="button"
																	onClick={() =>
																		setShowTailscaleApiKey(!showTailscaleApiKey)
																	}
																	className="text-muted-foreground hover:text-foreground transition-colors"
																>
																	{showTailscaleApiKey ? (
																		<EyeOff size={14} />
																	) : (
																		<Eye size={14} />
																	)}
																</button>
																<Lock
																	size={14}
																	className="text-muted-foreground"
																/>
															</div>
														</div>
														<p className="text-xs text-muted-foreground">
															Create an API key (tskey-api-...) in the Tailscale
															admin console. This is used to generate ephemeral
															auth keys for containers.
														</p>
													</div>
													<div className="space-y-2">
														<div className="flex items-center justify-between">
															<Label>Webhook Secret</Label>
															{savingField === "webhookSecret" && (
																<span className="text-xs text-muted-foreground flex items-center gap-1">
																	<RefreshCw
																		size={10}
																		className="animate-spin"
																	/>
																	Saving...
																</span>
															)}
															{tailscaleConfig?.hasWebhookSecret &&
																savingField !== "webhookSecret" && (
																	<span className="text-xs text-success flex items-center gap-1">
																		<Check size={10} />
																		Configured
																	</span>
																)}
														</div>
														<div className="relative">
															<Input
																type={
																	showTailscaleWebhookSecret
																		? "text"
																		: "password"
																}
																placeholder={
																	tailscaleConfig?.hasWebhookSecret
																		? "Enter new secret to update..."
																		: "tskey-webhook-..."
																}
																value={tailscaleWebhookSecret}
																onChange={(e) =>
																	setTailscaleWebhookSecret(e.target.value)
																}
																className="pr-16"
															/>
															<div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
																<button
																	type="button"
																	onClick={() =>
																		setShowTailscaleWebhookSecret(
																			!showTailscaleWebhookSecret,
																		)
																	}
																	className="text-muted-foreground hover:text-foreground transition-colors"
																>
																	{showTailscaleWebhookSecret ? (
																		<EyeOff size={14} />
																	) : (
																		<Eye size={14} />
																	)}
																</button>
																<Lock
																	size={14}
																	className="text-muted-foreground"
																/>
															</div>
														</div>
														<p className="text-xs text-muted-foreground">
															Create a webhook in the Tailscale admin console
															and copy the secret here
														</p>
													</div>
													<div className="space-y-2">
														<Label>Webhook URL</Label>
														<div className="flex items-center gap-2">
															<Input
																type="text"
																value={webhookUrl}
																readOnly
																className="font-mono text-xs bg-background"
															/>
															<Button
																variant="outline"
																size="icon"
																onClick={handleCopyWebhookUrl}
																className="shrink-0"
															>
																{webhookUrlCopied ? (
																	<Check size={14} className="text-success" />
																) : (
																	<Copy size={14} />
																)}
															</Button>
														</div>
														<p className="text-xs text-muted-foreground">
															Paste this URL in the Tailscale admin console when
															creating your webhook
														</p>
													</div>
													{tailscaleConfig?.lastValidated && (
														<div className="text-xs text-muted-foreground">
															Last synced:{" "}
															{new Date(
																tailscaleConfig.lastValidated,
															).toLocaleString()}
														</div>
													)}
													<div className="pt-2">
														<Button
															onClick={handleSyncDevices}
															disabled={
																isSyncing ||
																(!tailscaleConfig?.tailnetId &&
																	!tailscaleConfig?.hasApiKey)
															}
														>
															{isSyncing ? (
																<>
																	<RefreshCw
																		size={14}
																		className="mr-2 animate-spin"
																	/>
																	Syncing...
																</>
															) : (
																"Sync Devices"
															)}
														</Button>
													</div>
												</div>
											</div>
										</section>
									</div>
								</TabsContent>

								<TabsContent value="general" className="!mt-0">
									<div className="space-y-8">
										<section>
											<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
												<Sliders size={16} className="mr-2" /> Preferences
											</h3>
											<div className="bg-surface border border-border rounded-lg p-4">
												<div className="space-y-4 max-w-3xl">
													<div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
														<div className="flex items-center">
															<Bell
																size={18}
																className="text-muted-foreground mr-3"
															/>
															<div>
																<div className="text-sm font-medium text-foreground">
																	Notifications
																</div>
																<div className="text-xs text-muted-foreground">
																	Receive alerts for task updates
																</div>
															</div>
														</div>
														<Switch defaultChecked />
													</div>
													<div className="space-y-2">
														<Label>Theme</Label>
														<Select defaultValue="dark">
															<SelectTrigger>
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="dark">
																	Dark (Default)
																</SelectItem>
																<SelectItem value="light">Light</SelectItem>
																<SelectItem value="system">System</SelectItem>
															</SelectContent>
														</Select>
													</div>
												</div>
											</div>
										</section>
									</div>
								</TabsContent>
							</div>
						</Tabs>
					</div>
				</div>
			</div>
		</div>
	)
}
