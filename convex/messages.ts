import { v } from "convex/values";
// import { query, mutation } from "./_generated/server";
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";

export const list = query(async (ctx) => {
  return await ctx.db.query("messages").collect();
});

export const listByAuth = query(async (ctx) => {
  const user = await ctx.auth.getUserIdentity();
  return await ctx.db.query("messages").filter(q => q.eq(q.field("author"), user!.name)).collect();
});

export const send = mutation({
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    const message = { body, author };
    await ctx.db.insert("messages", message);
    return null
  },
});
