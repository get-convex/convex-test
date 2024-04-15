import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/// helpers

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("messages").collect();
  },
});

/// insert

export const insert = mutation({
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    const message = { body, author };
    return await ctx.db.insert("messages", message);
  },
});

/// patch

export const patch = mutation({
  args: { id: v.id("messages"), body: v.string(), extraProperties: v.optional(v.any()) },
  handler: async (ctx, { id, body, extraProperties }) => {
    const patchUpdate = extraProperties === undefined ? { body } : { body, ...extraProperties }
    await ctx.db.patch(id, patchUpdate);
  },
});

/// replace

export const replace = mutation({
  args: { id: v.id("messages"), author: v.string(), body: v.string() },
  handler: async (ctx, { id, author, body }) => {
    await ctx.db.replace(id, { author, body });
  },
});

/// delete

export const deleteDoc = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

/// transaction

export const throws = mutation({
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    const message = { body, author };
    await ctx.db.insert("messages", message);
    throw new Error("I changed my mind");
  },
});
