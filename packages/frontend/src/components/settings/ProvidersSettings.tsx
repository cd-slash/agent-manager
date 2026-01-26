import { api } from "@agent-manager/convex/api"
import { useQuery } from "convex/react"
import { Bot, RefreshCw } from "lucide-react"
import { ProviderCard } from "./ProviderCard"

export function ProvidersSettings() {
	// Fetch providers
	const providers = useQuery(api.aiProviders.list)

	// Show loading state
	if (providers === undefined) {
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

	// Show empty state if no providers
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
						Run the seed function in the Convex dashboard to initialize
						providers.
					</p>
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
