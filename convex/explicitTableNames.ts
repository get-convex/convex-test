import { mutation } from "./_generated/server";

export const correctUsage = mutation({
  args: {},
  handler: async (ctx) => {
    const docId = await ctx.db.insert("messages", {
      author: "Nicolas",
      body: "Hello world",
    });

    await ctx.db.get("messages", docId);

    await ctx.db.patch("messages", docId, { body: "Hello, world!" });
    await ctx.db.replace("messages", docId, {
      author: "Nicolas Ettlin",
      body: "Replaced task",
    });

    await ctx.db.delete("messages", docId);
  },
});

export const getWrongTable = mutation({
  args: {},
  handler: async (ctx) => {
    const docId = await ctx.db.insert("messages", {
      author: "Nicolas",
      body: "Hello world",
    });

    await ctx.db.get(
      // @ts-expect-error -- This uses a wrong table name so typecheck must fail
      "otherTable",
      docId,
    );
  },
});

export const patchWrongTable = mutation({
  args: {},
  handler: async (ctx) => {
    const docId = await ctx.db.insert("messages", {
      author: "Nicolas",
      body: "Hello world",
    });

    await ctx.db.patch(
      // @ts-expect-error -- This uses a wrong table name so typecheck must fail
      "otherTable",
      docId,
      {},
    );
  },
});

export const replaceWrongTable = mutation({
  args: {},
  handler: async (ctx) => {
    const docId = await ctx.db.insert("messages", {
      author: "Nicolas",
      body: "Hello world",
    });

    await ctx.db.replace(
      // @ts-expect-error -- This uses a wrong table name so typecheck must fail
      "otherTable",
      docId,
      { author: "Nicolas Ettlin", body: "Replaced task" },
    );
  },
});

export const deleteWrongTable = mutation({
  args: {},
  handler: async (ctx) => {
    const docId = await ctx.db.insert("messages", {
      author: "Nicolas",
      body: "Hello world",
    });

    await ctx.db.delete(
      // @ts-expect-error -- This uses a wrong table name so typecheck must fail
      "otherTable",
      docId,
    );
  },
});
