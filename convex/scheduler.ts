import { v } from "convex/values";
import { api } from "./_generated/api";
import { action, internalQuery, mutation } from "./_generated/server";

export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("messages").collect();
  },
});

export const add = mutation({
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    const message = { body, author };
    await ctx.db.insert("messages", message);
  },
});

export const actionCallingMutation = action({
  args: { body: v.string() },
  handler: async (ctx, { body }) => {
    await ctx.runMutation(api.scheduler.add, { body, author: "AI" });
  },
});

/// mutation scheduling action (1.0/schedule)

export const mutationSchedulingAction = mutation({
  args: { body: v.string() },
  handler: async (ctx, { body }) => {
    await ctx.scheduler.runAfter(0, api.scheduler.actionCallingMutation, {
      body,
    });
  },
});
