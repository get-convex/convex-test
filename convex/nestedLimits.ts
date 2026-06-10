import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation, query } from "./_generated/server";

const transactionLimitsValidator = v.object({
  bytesRead: v.optional(v.number()),
  bytesWritten: v.optional(v.number()),
  databaseQueries: v.optional(v.number()),
  documentsRead: v.optional(v.number()),
  documentsWritten: v.optional(v.number()),
  functionsScheduled: v.optional(v.number()),
  scheduledFunctionArgsBytes: v.optional(v.number()),
});

// Child query that reads every message.
export const readAll = query(async (ctx) => {
  const docs = await ctx.db.query("messages").collect();
  return docs.length;
});

// Child query that reads exactly `n` messages.
export const readN = query({
  args: { n: v.number() },
  handler: async (ctx, { n }) => {
    const docs = await ctx.db.query("messages").take(n);
    return docs.length;
  },
});

// Child mutation that inserts `count` messages.
export const insertMany = mutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("messages", { author: "child", body: `msg${i}` });
    }
  },
});

// Parent query that calls a nested query with custom transaction limits.
export const parentReadWithLimits = query({
  args: { transactionLimits: transactionLimitsValidator },
  handler: async (ctx, { transactionLimits }): Promise<number> => {
    return await ctx.runQuery(
      api.nestedLimits.readAll,
      {},
      { transactionLimits },
    );
  },
});

// Parent query that calls a nested query without any custom limits.
export const parentReadNoLimits = query(async (ctx): Promise<number> => {
  return await ctx.runQuery(api.nestedLimits.readAll, {});
});

// Parent mutation that calls a nested mutation with custom transaction limits.
export const parentInsertWithLimits = mutation({
  args: {
    count: v.number(),
    transactionLimits: transactionLimitsValidator,
  },
  handler: async (ctx, { count, transactionLimits }) => {
    await ctx.runMutation(
      api.nestedLimits.insertMany,
      { count },
      { transactionLimits },
    );
  },
});

// Parent query that runs a tightly-limited nested query, then reads more on
// its own. Used to verify the nested scope's limit does not leak back to the
// parent transaction once the nested call returns.
export const nestThenReadAll = query({
  args: {
    nestedReadCount: v.number(),
    transactionLimits: transactionLimitsValidator,
  },
  handler: async (
    ctx,
    { nestedReadCount, transactionLimits },
  ): Promise<number> => {
    await ctx.runQuery(
      api.nestedLimits.readN,
      { n: nestedReadCount },
      { transactionLimits },
    );
    const docs = await ctx.db.query("messages").collect();
    return docs.length;
  },
});
