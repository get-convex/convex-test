import { internalMutation, internalQuery } from "./_generated/server";
import { components } from "./_generated/api";

export const directCall = internalMutation({
  args: {},
  handler: async (ctx, _args) => {
    await ctx.runMutation(components.counter.public.add, {
      name: "pennies",
      count: 250,
    });
    await ctx.runMutation(components.counter.public.add, {
      name: "beans",
      count: 3,
      shards: 100,
    });
    const count = await ctx.runQuery(components.counter.public.count, {
      name: "beans",
    });
    return count;
  },
});

export const directCall2 = internalQuery({
  args: {},
  handler: async (ctx, _args) => {
    const count = await ctx.runQuery(components.counter.public.count, {
      name: "beans",
    });
    return count;
  },
});
