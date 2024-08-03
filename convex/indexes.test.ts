import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";

// TypeScript won't let you run into this error.
test("index must use only its fields", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await expect(
      async () =>
        await ctx.db
          .query("messages")
          .withIndex("author", (q) =>
            (q.eq("author", "sarah") as any).eq("body", "hello1"),
          )
          .collect(),
    ).rejects.toThrow();
  });
});

// TypeScript won't let you run into this error.
test("index must use only its fields, by_id", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await expect(
      async () =>
        await ctx.db
          .query("messages")
          .withIndex("by_id", (q) => (q as any).eq("_creationTime", 3))
          .collect(),
    ).rejects.toThrow();
  });
});

// TypeScript won't let you run into this error.
test("index must use only its fields, by_creation_time", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await expect(
      async () =>
        await ctx.db
          .query("messages")
          .withIndex("by_creation_time", (q) => (q as any).eq("_id", 3))
          .collect(),
    ).rejects.toThrow();
  });
});
