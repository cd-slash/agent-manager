import { v } from "convex/values"
import { internal } from "./_generated/api"
import { action } from "./_generated/server"

// Sync devices from Tailscale (public action for frontend)
export const syncDevices = action({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		serversAdded: number
		containersAdded: number
		totalDevices: number
	}> => {
		return await ctx.runAction(internal.internal.tailscale.performFullSync)
	},
})

// Delete a device from Tailscale (called when deleting containers)
export const deleteDevice = action({
	args: { nodeId: v.string() },
	handler: async (ctx, args): Promise<{ deleted: boolean; reason?: string }> => {
		const result = await ctx.runAction(
			internal.internal.tailscale.deleteDeviceFromTailscale,
			{ nodeId: args.nodeId },
		)
		return result
	},
})
