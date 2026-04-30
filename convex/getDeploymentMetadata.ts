import { jsonToConvex } from "convex/values";
import { action, mutation, query } from "./_generated/server";

// TODO: replace with ctx.meta.getDeploymentMetadata() once available.
async function getDeploymentMetadata(): Promise<{
  name: string;
  region: string | null;
  class: "s16" | "s256" | "d1024";
}> {
  const syscalls = (globalThis as any).Convex;
  const syscallJSON = JSON.parse(
    await syscalls.asyncSyscall(
      "1.0/getDeploymentMetadata",
      JSON.stringify({}),
    ),
  );
  const result = jsonToConvex(syscallJSON) as any;
  return {
    name: result.name,
    region: result.region ?? null,
    class: result.class,
  };
}

export const metadataQuery = query({
  args: {},
  handler: async () => {
    return await getDeploymentMetadata();
  },
});

export const metadataMutation = mutation({
  args: {},
  handler: async () => {
    return await getDeploymentMetadata();
  },
});

export const metadataAction = action({
  args: {},
  handler: async () => {
    return await getDeploymentMetadata();
  },
});
