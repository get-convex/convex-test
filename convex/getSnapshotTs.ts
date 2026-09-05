import { jsonToConvex, v } from "convex/values";
import { mutation, query } from "./_generated/server";

// TODO: replace with ctx.meta.getSnapshotTs() once available in the SDK.
export function getSnapshotTs(): bigint {
  const syscalls = (globalThis as any).Convex;
  const syscallJSON = JSON.parse(
    syscalls.syscall("1.0/getSnapshotTs", JSON.stringify({})),
  );
  return jsonToConvex(syscallJSON) as bigint;
}

export const snapshotQuery = query({
  args: {},
  returns: v.int64(),
  handler: () => getSnapshotTs(),
});

export const snapshotMutation = mutation({
  args: {},
  returns: v.object({
    id: v.id("commitTs"),
    snapshotTs: v.int64(),
    commitTs: v.commitTs(),
  }),
  handler: async (ctx) => {
    const snapshotTs = getSnapshotTs();
    const id = await ctx.db.insert("commitTs", {
      commitTs: ctx.db.vars.commitTs,
    });
    return { id, snapshotTs, commitTs: ctx.db.vars.commitTs };
  },
});
