import { api } from "@agent-manager/convex/api"
import { useMutation, useQuery } from "convex/react"
import { Bot, Plus, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { Button } from "@/components/ui/button"
import { ProviderCard } from "./ProviderCard"

export function ProvidersSettings() {
	const toast = useToast()
	const [isSeeding, setIsSeeding] = useState(false)

	// Fetch providers
	const providers = useQuery(api.aiProviders.list)
	const hasBeenSeeded = useQuery(api.aiProviders.hasBeenSeeded)

	// Seed mutation
	const seedProviders = useMutation(api.seed.seedAiProviders)

	// Auto-seed if no providers exist
	useEffect(() => {
		const autoSeed = async () => {
			if (hasBeenSeeded === false && !isSeeding) {
				setIsSeeding(true)
				try {
					await seedProviders()
				} catch (error) {
					console.error("Failed to seed providers:", error)
				} finally {
					setIsSeeding(false)
				}
			}
		}
		autoSeed()
	}, [hasBeenSeeded, isSeeding, seedProviders])

	const handleManualSeed = async () => {
		setIsSeeding(true)
		try {
			const result = await seedProviders()
			toast.success("Providers initialized", result.message)
		} catch (error) {
			toast.error(
				"Failed to initialize",
				error instanceof Error ? error.message : "Unknown error",
			)
		} finally {
			setIsSeeding(false)
		}
	}

	// Show loading state
	if (providers === undefined || hasBeenSeeded === undefined) {
		return (
			<section>
				<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
					<Bot size={16} className="mr-2" /> AI Providers
				</h3>
				<div className="flex items-center justify-center py-8">
					<RefreshCw size={20} className="animate-spin text-muted-foreground" />
				</div>
			</section>
		)
	}

	// Show empty state with seed button if no providers
	if (providers.length === 0) {
		return (
			<section>
				<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center">
					<Bot size={16} className="mr-2" /> AI Providers
				</h3>
				<div className="bg-surface border border-border rounded-lg p-8 text-center">
					<Bot size={48} className="mx-auto text-muted-foreground mb-4" />
					<h4 className="text-lg font-medium text-foreground mb-2">
						No AI Providers Configured
					</h4>
					<p className="text-sm text-muted-foreground mb-4">
						Initialize the built-in providers (Anthropic, OpenAI, Google) to get
						started.
					</p>
					<Button onClick={handleManualSeed} disabled={isSeeding}>
						{isSeeding ? (
							<>
								<RefreshCw size={14} className="mr-2 animate-spin" />
								Initializing...
							</>
						) : (
							<>
								<Plus size={14} className="mr-2" />
								Initialize Providers
							</>
						)}
					</Button>
				</div>
			</section>
		)
	}

	return (
		<section>
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center">
					<Bot size={16} className="mr-2" /> AI Providers
				</h3>
			</div>
			<p className="text-sm text-muted-foreground mb-4">
				Configure AI model providers and their authentication. Enable or disable
				providers and individual models to control which are available for agent
				phases.
			</p>
			<div className="space-y-3">
				{providers.map((provider) => (
					<ProviderCard key={provider._id} provider={provider} />
				))}
			</div>
		</section>
	)
}
