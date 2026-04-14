import { action, mutation, query } from "./_generated/server";

// TODO: replace with ctx.meta.getFunctionMetadata() in 1.36+
async function getFunctionMetadata() {
  const syscalls = (global as any).Convex;
  return JSON.parse(
    await syscalls.asyncSyscall("1.0/getFunctionMetadata", JSON.stringify({})),
  );
}

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
