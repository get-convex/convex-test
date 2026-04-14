import { action, mutation, query } from "./_generated/server";
import { getFunctionMetadata } from "./meta";

export const metadataQuery = query({
  args: {},
  handler: async () => {
    return await getFunctionMetadata();
  },
});

export const metadataMutation = mutation({
  args: {},
  handler: async () => {
    return await getFunctionMetadata();
  },
});

export const metadataAction = action({
  args: {},
  handler: async () => {
    return await getFunctionMetadata();
  },
});

export default query({
  args: {},
  handler: async () => {
    return await getFunctionMetadata();
  },
});
