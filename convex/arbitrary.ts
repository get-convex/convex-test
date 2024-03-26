import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

export const actionCallingAction = internalAction({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    if (count > 0) {
      const result: { called: number } = await ctx.runAction(
        internal.arbitrary.actionCallingAction,
        { count: count - 1 }
      );
      return { called: result.called + 1 };
    }
    return { called: 0 };
  },
});

export const readFoos = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("foos").collect();
  },
});

export const actionCallingQuery = internalAction({
  args: {},
  handler: async (ctx) => {
    const result: Doc<"foos">[] = await ctx.runQuery(
      internal.arbitrary.readFoos,
      {}
    );
    return result;
  },
});
