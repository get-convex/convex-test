"use node";

import { api } from "./_generated/api";
import { action } from "./_generated/server";

export const metadataAction = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(api.requestMetadata.record, {
      label: "mutationFromNodeAction",
    });
    return await ctx.meta.getRequestMetadata();
  },
});
