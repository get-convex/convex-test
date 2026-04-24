import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";

export const throwsObject = mutation({
  args: {},
  handler: async () => {
    throw new ConvexError({ kind: "x" });
  },
});

export const throwsString = mutation({
  args: {},
  handler: async () => {
    throw new ConvexError("just a message");
  },
});

export const queryThrowsObject = query({
  args: {},
  handler: async () => {
    throw new ConvexError({ kind: "q" });
  },
});

export const actionThrowsObject = action({
  args: {},
  handler: async () => {
    throw new ConvexError({ kind: "a" });
  },
});

export const mutationCatchingConvexError = mutation({
  args: {},
  handler: async (ctx): Promise<unknown> => {
    try {
      await ctx.runMutation(api.convexError.throwsObject, {});
    } catch (e) {
      if (e instanceof ConvexError) {
        return e.data;
      }
      throw e;
    }
    return null;
  },
});
