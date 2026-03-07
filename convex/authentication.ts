import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";

export const actionCallingQuery = action({
  args: {},
  async handler(ctx): Promise<string | null> {
    return await ctx.runQuery(api.authentication.queryName);
  },
});

export const mutationCallingQuery = mutation({
  args: {},
  async handler(ctx): Promise<string | null> {
    return await ctx.runQuery(api.authentication.queryName);
  },
});

export const queryCallingQuery = query({
  args: {},
  async handler(ctx): Promise<string | null> {
    return await ctx.runQuery(api.authentication.queryName);
  },
});

export const queryName = query({
  args: {},
  async handler(ctx) {
    return (await ctx.auth.getUserIdentity())?.name;
  },
});

export const actionCallingMutation = action({
  args: {},
  async handler(ctx): Promise<string | null> {
    return await ctx.runMutation(api.authentication.mutationName);
  },
});

export const mutationCallingMutation = mutation({
  args: {},
  async handler(ctx): Promise<string | null> {
    return await ctx.runMutation(api.authentication.mutationName);
  },
});

export const mutationCallingMutationCallingQuery = mutation({
  args: {},
  async handler(ctx): Promise<string | null> {
    return await ctx.runMutation(api.authentication.mutationCallingQuery);
  },
});

export const mutationName = mutation({
  args: {},
  async handler(ctx) {
    return (await ctx.auth.getUserIdentity())?.name;
  },
});

export const actionCallingAction = action({
  args: {},
  async handler(ctx): Promise<string | null> {
    return await ctx.runAction(api.authentication.actionName);
  },
});

export const actionCallingActionCallingQuery = action({
  args: {},
  async handler(ctx): Promise<string | null> {
    return await ctx.runAction(api.authentication.actionCallingQuery);
  },
});

export const actionName = action({
  args: {},
  async handler(ctx): Promise<string | null> {
    return (await ctx.auth.getUserIdentity())?.name ?? null;
  },
});
