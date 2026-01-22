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
	Link2,
	Lock,
	Network,
	RefreshCw,
	Server,
	Sliders,
} from "lucide-react"
import { useEffect, useState } from "react"
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
import { PhaseDefaultsSettings } from "./PhaseDefaultsSettings"
import { ProvidersSettings } from "./ProvidersSettings"
import { TaskTemplatesSettings } from "./TaskTemplatesSettings"

// Gateway Configuration Section Component
function GatewayConfigSection() {
	const toast = useToast()
	const [gatewayUrl, setGatewayUrl] = useState("")
	const [defaultServer, setDefaultServer] = useState("")
	const [defaultRepo, setDefaultRepo] = useState("")
	const [isSaving, setIsSaving] = useState(false)
	const [isCheckingStatus, setIsCheckingStatus] = useState(false)

	// Convex hooks
	const gatewayConfig = useQuery(api.settings.getGatewayConfig)
	const setGatewayConfig = useMutation(api.settings.setGatewayConfig)
	const getManagementContainerStatus = useAction(
		api.aiProviders.getManagementContainerStatus,
	)

	const [managementStatus, setManagementStatus] = useState<{
		exists: boolean
		running: boolean
		container: { containerId: string; name: string; hostname: string } | null
	} | null>(null)

	// Load initial values
	useEffect(() => {
		if (gatewayConfig) {
			setGatewayUrl(gatewayConfig.url || "")
			setDefaultServer(gatewayConfig.defaultServer || "")
			setDefaultRepo(gatewayConfig.defaultRepo || "")
		}
	}, [gatewayConfig])

	const handleCheckStatus = async () => {
		setIsCheckingStatus(true)
		try {
			const status = await getManagementContainerStatus()
			setManagementStatus(status)
			if (status.running) {
				toast.success("Gateway Connected", "Management container is running")
			} else if (status.exists) {
				toast.warning(
					"Container Stopped",
					"Management container exists but is not running",
				)
			} else {
				toast.info("No Container", "No management container found")
			}
		} catch (error) {
			toast.error(
				"Connection Failed",
				error instanceof Error ? error.message : "Could not connect to gateway",
			)
		} finally {
			setIsCheckingStatus(false)
		}
	}

	const handleSave = async () => {
		setIsSaving(true)
		try {
			await setGatewayConfig({
				url: gatewayUrl || undefined,
				defaultServer: defaultServer || undefined,
				defaultRepo: defaultRepo || undefined,
			})
			toast.success("Saved", "Gateway configuration saved")
		} catch (error) {
			toast.error(
				"Failed to save",
				error instanceof Error ? error.message : "Unknown error",
			)
		} finally {
			setIsSaving(false)
		}
	}

	const isDirty =
		gatewayUrl !== (gatewayConfig?.url || "") ||
		defaultServer !== (gatewayConfig?.defaultServer || "") ||
		defaultRepo !== (gatewayConfig?.defaultRepo || "")

	return (
		<section>
			<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
				<Server size={16} className="mr-2" /> Agent Gateway
			</h3>
			<div className="bg-surface border border-border rounded-lg p-4">
				<p className="text-sm text-muted-foreground mb-4">
					Configure the agent gateway for container management and OAuth
					authentication. The gateway handles communication with agent
					containers.
				</p>
				<div className="space-y-4 max-w-3xl">
					<div className="space-y-2">
						<Label>Gateway URL</Label>
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
						<Label>Default Server</Label>
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
						<Label>Default Repository</Label>
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

					{/* Management Container Status */}
					<div className="pt-2 border-t border-border">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Link2 size={14} className="text-muted-foreground" />
								<span className="text-sm font-medium">
									Management Container
								</span>
								{managementStatus?.running && (
									<span className="text-[10px] px-1.5 py-0.5 bg-success/20 rounded text-success flex items-center gap-1">
										<Check size={10} />
										Running
									</span>
								)}
								{managementStatus?.exists && !managementStatus.running && (
									<span className="text-[10px] px-1.5 py-0.5 bg-warning/20 rounded text-warning">
										Stopped
									</span>
								)}
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={handleCheckStatus}
								disabled={isCheckingStatus}
							>
								{isCheckingStatus ? (
									<RefreshCw size={14} className="animate-spin" />
								) : (
									"Check Status"
								)}
							</Button>
						</div>
						{managementStatus?.container && (
							<div className="mt-2 text-xs text-muted-foreground">
								<div>Container: {managementStatus.container.name}</div>
								<div>Hostname: {managementStatus.container.hostname}</div>
							</div>
						)}
					</div>

					<div className="pt-2">
						<Button onClick={handleSave} disabled={isSaving || !isDirty}>
							{isSaving ? (
								<>
									<RefreshCw size={14} className="mr-2 animate-spin" />
									Saving...
								</>
							) : (
								"Save Gateway Config"
							)}
						</Button>
					</div>
				</div>
			</div>
		</section>
	)
}

export function SettingsView() {
	const [activeTab, setActiveTab] = useState("credentials")
	const toast = useToast()

	// Container secrets state
	const [tsAuthKey, setTsAuthKey] = useState("")
	const [ghUsername, setGhUsername] = useState("")
	const [ghToken, setGhToken] = useState("")
	const [isSavingContainerSecrets, setIsSavingContainerSecrets] =
		useState(false)

	// Visibility toggles for password fields
	const [showTsAuthKey, setShowTsAuthKey] = useState(false)
	const [showGhToken, setShowGhToken] = useState(false)
	const [showTailscaleApiKey, setShowTailscaleApiKey] = useState(false)
	const [showTailscaleWebhookSecret, setShowTailscaleWebhookSecret] =
		useState(false)

	// Tailscale state
	const [tailnetId, setTailnetId] = useState("")
	const [tailscaleApiKey, setTailscaleApiKey] = useState("")
	const [tailscaleWebhookSecret, setTailscaleWebhookSecret] = useState("")
	const [isSavingTailscale, setIsSavingTailscale] = useState(false)
	const [webhookUrlCopied, setWebhookUrlCopied] = useState(false)

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
	const upsertSetting = useMutation(api.settings.upsert)
	const syncDevices = useAction(api.tailscale.syncDevices)

	// Convex hooks for secrets
	const secretsList = useQuery(api.secrets.list)
	const setSecret = useMutation(api.secrets.set)
	const storedGhUsername = useQuery(api.secrets.get, { key: "GH_USERNAME" })

	// Check which secrets are configured
	const hasSecret = (key: string) =>
		secretsList?.some((s) => s.key === key && s.hasValue)

	const handleSaveContainerSecrets = async () => {
		setIsSavingContainerSecrets(true)
		try {
			const promises = []
			if (tsAuthKey) {
				promises.push(
					setSecret({
						key: "TS_AUTHKEY",
						value: tsAuthKey,
						description: "Tailscale auth key for container networking",
					}),
				)
			}
			if (ghUsername) {
				promises.push(
					setSecret({
						key: "GH_USERNAME",
						value: ghUsername,
						description: "GitHub username for repository cloning",
					}),
				)
			}
			if (ghToken) {
				promises.push(
					setSecret({
						key: "GH_TOKEN",
						value: ghToken,
						description: "GitHub personal access token",
					}),
				)
			}

			if (promises.length === 0) {
				toast.error("No changes", "Enter at least one secret to save")
				return
			}

			await Promise.all(promises)
			toast.success(
				"Secrets saved",
				"Container secrets have been stored securely",
			)

			// Clear input fields
			setTsAuthKey("")
			setGhUsername("")
			setGhToken("")
		} catch (error) {
			toast.error(
				"Failed to save",
				error instanceof Error ? error.message : "Failed to save secrets",
			)
		} finally {
			setIsSavingContainerSecrets(false)
		}
	}

	const handleSaveTailscale = async () => {
		setIsSavingTailscale(true)

		try {
			// Save credentials
			await upsertSetting({
				key: "tailscale",
				value: {
					tailnetId: tailnetId || tailscaleConfig?.tailnetId || "",
					apiKey: tailscaleApiKey || undefined, // Only update if provided
					webhookSecret: tailscaleWebhookSecret || undefined, // Only update if provided
				},
			})

			// Trigger initial sync
			await syncDevices()

			toast.success(
				"Tailscale configured",
				"Configuration saved and devices synced successfully",
			)
			setTailscaleApiKey("") // Clear the API key field for security
			setTailscaleWebhookSecret("") // Clear the webhook secret field for security
		} catch (error) {
			toast.error(
				"Configuration failed",
				error instanceof Error
					? error.message
					: "Failed to save Tailscale configuration",
			)
		} finally {
			setIsSavingTailscale(false)
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
												<Container size={16} className="mr-2" /> Container
												Creation Secrets
											</h3>
											<div className="bg-surface border border-border rounded-lg p-4">
												<p className="text-sm text-muted-foreground mb-4">
													These credentials are required for creating new agent
													containers. They are stored securely in Convex.
												</p>
												<div className="space-y-4 max-w-3xl">
													<div className="space-y-2">
														<Label>Tailscale Auth Key</Label>
														<div className="relative">
															<Input
																type={showTsAuthKey ? "text" : "password"}
																placeholder={
																	hasSecret("TS_AUTHKEY")
																		? "••••••••••••••••"
																		: "tskey-auth-..."
																}
																value={tsAuthKey}
																onChange={(e) => setTsAuthKey(e.target.value)}
																className="pr-16"
															/>
															<div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
																<button
																	type="button"
																	onClick={() =>
																		setShowTsAuthKey(!showTsAuthKey)
																	}
																	className="text-muted-foreground hover:text-foreground transition-colors"
																>
																	{showTsAuthKey ? (
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
															{hasSecret("TS_AUTHKEY")
																? "Auth key is configured. Enter a new key to update it."
																: "Create a reusable auth key in the Tailscale admin console"}
														</p>
													</div>
													<div className="space-y-2">
														<Label>GitHub Username</Label>
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
														<Label>GitHub Personal Access Token</Label>
														<div className="relative">
															<Input
																type={showGhToken ? "text" : "password"}
																placeholder={
																	hasSecret("GH_TOKEN")
																		? "••••••••••••••••"
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
															{hasSecret("GH_TOKEN")
																? "Token is configured. Enter a new token to update it."
																: "Create a PAT with repo access at GitHub Settings > Developer settings"}
														</p>
													</div>
													<div className="pt-2">
														<Button
															onClick={handleSaveContainerSecrets}
															disabled={
																isSavingContainerSecrets ||
																(!tsAuthKey && !ghUsername && !ghToken)
															}
														>
															{isSavingContainerSecrets ? (
																<>
																	<RefreshCw
																		size={14}
																		className="mr-2 animate-spin"
																	/>
																	Saving...
																</>
															) : (
																"Save Container Secrets"
															)}
														</Button>
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
														<Label>Tailnet ID</Label>
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
														<Label>API Key</Label>
														<div className="relative">
															<Input
																type={showTailscaleApiKey ? "text" : "password"}
																placeholder={
																	tailscaleConfig?.hasApiKey
																		? "••••••••••••••••"
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
															{tailscaleConfig?.hasApiKey
																? "API key is configured. Enter a new key to update it."
																: "Create an API key in the Tailscale admin console with read access to devices"}
														</p>
													</div>
													<div className="space-y-2">
														<Label>Webhook Secret</Label>
														<div className="relative">
															<Input
																type={
																	showTailscaleWebhookSecret
																		? "text"
																		: "password"
																}
																placeholder={
																	tailscaleConfig?.hasWebhookSecret
																		? "••••••••••••••••"
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
															{tailscaleConfig?.hasWebhookSecret
																? "Webhook secret is configured. Enter a new secret to update it."
																: "Create a webhook in the Tailscale admin console and copy the secret here"}
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
															onClick={handleSaveTailscale}
															disabled={
																isSavingTailscale ||
																(!tailnetId && !tailscaleConfig?.tailnetId)
															}
														>
															{isSavingTailscale ? (
																<>
																	<RefreshCw
																		size={14}
																		className="mr-2 animate-spin"
																	/>
																	Saving & Syncing...
																</>
															) : (
																"Save & Sync"
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
