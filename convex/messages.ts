import { v } from "convex/values";
// import { query, mutation } from "./_generated/server";
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";

export const list = query(async (ctx) => {
  return await ctx.db.query("messages").collect();
});

export const listByAuth = query(async (ctx, args: { author: string }) => {
  return await ctx.db.query("messages").filter(q => q.eq(q.field("author"), args.author)).collect();
});

export const send = mutation({
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    debugger;
    console.log("### in function")
    const message = { body, author };
    await ctx.db.insert("messages", message);
    console.log("### about to leave function")
    return null
  },
});
