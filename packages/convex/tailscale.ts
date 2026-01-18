import { action } from "./_generated/server";
import { internal } from "./_generated/api";

// Sync devices from Tailscale (public action for frontend)
export const syncDevices = action({
  args: {},
  handler: async (ctx): Promise<{
    serversAdded: number;
    containersAdded: number;
    totalDevices: number;
  }> => {
    return await ctx.runAction(internal.internal.tailscale.performFullSync);
  },
});
