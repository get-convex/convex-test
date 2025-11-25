import { mutation } from "./_generated/server";

export const correctUsage = mutation({
  args: {},
  handler: async (ctx) => {
    const docId = await ctx.db.insert("messages", {
      author: "Nicolas",
      body: "Hello world",
    });

    // @ts-expect-error -- Upcoming API syntax
    await ctx.db.get("messages", docId);

    // @ts-expect-error -- Upcoming API syntax
    await ctx.db.patch("messages", docId, {
      body: "Hello, world!",
    });
    // @ts-expect-error -- Upcoming API syntax
    await ctx.db.replace("messages", docId, {
      author: "Nicolas Ettlin",
      body: "Replaced task",
    });

    // @ts-expect-error -- Upcoming API syntax
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
      "otherTable",
      // @ts-expect-error -- Wrong table
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
      "otherTable",
      docId,
      // @ts-expect-error -- Wrong table
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
      "otherTable",
      docId,
      // @ts-expect-error -- Wrong table
      {
        author: "Nicolas Ettlin",
        body: "Replaced task",
      },
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
      "otherTable",
      // @ts-expect-error -- Wrong table
      docId,
    );
  },
});
