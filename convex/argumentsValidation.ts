import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";

export const queryWithArgs = query({
  args: {
    a: v.number(),
  },
  // Never gets called in the test
  /* v8 ignore next */
  handler: () => {},
});

export const queryWithoutArgs = query(() => {});

export const mutationWithArgs = mutation({
  args: {
    a: v.number(),
  },
  // Never gets called in the test
  /* v8 ignore next */
  handler: () => {},
});

export const mutationWithoutArgs = mutation(() => {});

export const actionWithArgs = action({
  args: {
    a: v.number(),
  },
  // Never gets called in the test
  /* v8 ignore next */
  handler: () => {},
});

export const actionWithoutArgs = action(() => {});

export const queryWithOptionalArgs = query({
  args: {
    a: v.optional(v.number()),
  },
  handler: () => {
    return "ok";
  },
});
