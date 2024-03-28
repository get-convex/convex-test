import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";

export const queryWithArgs = query({
  args: {
    a: v.number(),
  },
  handler: () => {},
});

export const queryWithoutArgs = query(() => {});

export const mutationWithArgs = mutation({
  args: {
    a: v.number(),
  },
  handler: () => {},
});

export const mutationWithoutArgs = mutation(() => {});

export const actionWithArgs = action({
  args: {
    a: v.number(),
  },
  handler: () => {},
});

export const actionWithoutArgs = action(() => {});
