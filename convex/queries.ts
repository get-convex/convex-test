import { v } from "convex/values";
import { query } from "./_generated/server";

/// collect (1.0/queryStream, 1.0/queryStreamNext)

export const list = query(async (ctx) => {
  return await ctx.db.query("messages").collect();
});

/// order

export const lastN = query({
  args: { count: v.number() },
  handler: async (ctx, args) => {
    const lastMessages = await ctx.db
      .query("messages")
      .order("desc")
      .take(args.count);
    return lastMessages.reverse();
  },
});
