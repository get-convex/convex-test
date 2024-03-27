import { query } from "./_generated/server";

/// collect (1.0/queryStream, 1.0/queryStreamNext)

export const list = query(async (ctx) => {
  return await ctx.db.query("messages").collect();
});
