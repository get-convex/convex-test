import { v } from "convex/values";
import { api, components } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";

export const metadataMutation = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getRequestMetadata();
  },
});

export const metadataAction = action({
  args: {},
  handler: async (ctx) => {
    return await ctx.meta.getRequestMetadata();
  },
});

// `getRequestMetadata` is not part of a query's `ctx.meta`, so the syscall
// has to be called directly to check that queries are rejected.
export const metadataQuery = query({
  args: {},
  handler: async () => {
    const syscalls = (globalThis as any).Convex;
    return JSON.parse(
      await syscalls.asyncSyscall("1.0/getRequestMetadata", JSON.stringify({})),
    );
  },
});

// Records the metadata of the function execution it runs in, so that
// executions that don't return to the test (like scheduled functions) can be
// inspected afterwards.
export const record = mutation({
  args: { label: v.string() },
  returns: v.null(),
  handler: async (ctx, { label }) => {
    await ctx.db.insert("requestMetadata", {
      label,
      metadata: await ctx.meta.getRequestMetadata(),
    });
    return null;
  },
});

export const recorded = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("requestMetadata").collect();
  },
});

export const mutationCallingMutation = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(api.requestMetadata.record, { label: "nested" });
    const component = await ctx.runMutation(
      components.counter.public.requestMetadata,
      {},
    );
    return { own: await ctx.meta.getRequestMetadata(), component };
  },
});

export const actionCallingFunctions = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(api.requestMetadata.record, {
      label: "mutationFromAction",
    });
    await ctx.runAction(api.requestMetadata.actionRecordingMetadata, {
      label: "actionFromAction",
    });
    const component = await ctx.runAction(
      components.counter.public.requestMetadataAction,
      {},
    );
    return { own: await ctx.meta.getRequestMetadata(), component };
  },
});

export const actionRecordingMetadata = action({
  args: { label: v.string() },
  returns: v.null(),
  handler: async (ctx, { label }): Promise<null> => {
    await ctx.runMutation(api.requestMetadata.record, { label });
    return null;
  },
});

export const scheduleMutation = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, api.requestMetadata.scheduledMutation, {});
    return await ctx.meta.getRequestMetadata();
  },
});

export const scheduledMutation = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    await ctx.db.insert("requestMetadata", {
      label: "scheduledMutation",
      metadata: await ctx.meta.getRequestMetadata(),
    });
    await ctx.runMutation(api.requestMetadata.record, {
      label: "nestedInScheduledMutation",
    });
    return null;
  },
});

export const scheduleAction = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, api.requestMetadata.scheduledAction, {});
    return await ctx.meta.getRequestMetadata();
  },
});

export const scheduledAction = action({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    await ctx.runMutation(api.requestMetadata.record, {
      label: "nestedInScheduledAction",
    });
    await ctx.scheduler.runAfter(0, api.requestMetadata.scheduledMutation, {});
    return null;
  },
});
