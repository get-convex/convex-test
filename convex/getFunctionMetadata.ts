import { action, mutation, query } from "./_generated/server";

export const metadataQuery = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  },
});

export const metadataMutation = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  },
});

export const metadataAction = action({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  },
});

export default query({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getFunctionMetadata();
  },
});
