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
  args: { id: v.id("messages"), body: v.string() },
  handler: async (ctx, { id, body }) => {
    await ctx.db.patch(id, { body });
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
