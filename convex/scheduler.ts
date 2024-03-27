import { v } from "convex/values";
import { api } from "./_generated/api";
import { action, internalQuery, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

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

export const jobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.system.query("_scheduled_functions").collect();
  },
});

/// mutation scheduling action (1.0/schedule)

export const mutationSchedulingAction = mutation({
  args: { body: v.string(), delayMs: v.number() },
  handler: async (ctx, { body, delayMs }) => {
    const id: Id<"_scheduled_functions"> = await ctx.scheduler.runAfter(
      delayMs,
      api.scheduler.actionCallingMutation,
      {
        body,
      }
    );
    return id;
  },
});

export const cancel = mutation({
  args: { id: v.id("_scheduled_functions") },
  handler: async (ctx, { id }) => {
    await ctx.scheduler.cancel(id);
  },
});
