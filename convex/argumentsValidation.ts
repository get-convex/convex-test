import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { components } from "./_generated/api";

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

export const componentMutationWithNumberArg = mutation({
  args: { a: v.any() },
  handler: (ctx, args) => {
    const result = ctx.runMutation(
      components.counter.public.mutationWithNumberArg,
      {
        a: args.a,
      },
    );
    return result;
  },
});

export const queryWithUnionArg = query({
  args: {
    a: v.union(v.number(), v.string()),
  },
  handler: () => {
    return "ok";
  },
});

export const queryWithStripObjectArg = query({
  args: v.object({ a: v.number() }),
  handler: (_, args) => {
    return args;
  },
});

export const mutationWithStripObjectArg = mutation({
  args: v.object({ a: v.number() }),
  handler: (_, args) => {
    return args;
  },
});

export const actionWithStripObjectArg = action({
  args: v.object({ a: v.number() }),
  handler: (_, args) => {
    return args;
  },
});

export const queryWithUnionStripNarrowFirstArg = query({
  args: {
    obj: v.union(
      v.object({ a: v.number() }),
      v.object({ a: v.number(), b: v.number() }),
    ),
  },
  handler: (_, args) => {
    return args.obj;
  },
});

export const queryWithUnionStripWideFirstArg = query({
  args: {
    obj: v.union(
      v.object({ a: v.number(), b: v.number() }),
      v.object({ a: v.number() }),
    ),
  },
  handler: (_, args) => {
    return args.obj;
  },
});

export const queryWithUnionNestedStripFailureArg = query({
  args: {
    obj: v.union(
      v.object({
        inner: v.object({ a: v.number() }),
        must: v.string(),
      }),
      v.object({
        inner: v.object({ a: v.number(), extra: v.string() }),
      }),
    ),
  },
  handler: (_, args) => {
    return args.obj;
  },
});
