import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

test("collect", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello1" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello2" });
  });
  const messages = await t.query(api.queries.list);
  expect(messages).toMatchObject([
    { author: "sarah", body: "hello1" },
    { author: "sarah", body: "hello2" },
  ]);
});

test("withIndex", async () => {
  const t = convexTest(schema);
  const messages = await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello1" });
    await ctx.db.insert("messages", { author: "michal", body: "hello2" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello2" });
    return await ctx.db
      .query("messages")
      .withIndex("author", (q) => q.eq("author", "sarah"))
      .collect();
  });
  expect(messages).toMatchObject([
    { author: "sarah", body: "hello1" },
    { author: "sarah", body: "hello2" },
  ]);
});

const relaxedSchema = defineSchema({
  messages: defineTable({
    author: v.optional(v.any()),
    body: v.string(),
  }).index("author", ["author"]),
});

// test("type ordering", async () => {
//   const t = convexTest(relaxedSchema);
//   const authors = await t.run(async (ctx) => {
//     const authors: any[] = [
//       "stringValue",
//       "xFactor",
//       undefined,
//       false,
//       true,
//       34,
//       35,
//       BigInt(34),
//       null,
//       ["a"],
//       { a: 1 },
//       new ArrayBuffer(8),
//     ];
//     await Promise.all(
//       authors.map(async (author) => {
//         await ctx.db.insert("messages", { author, body: "hello" });
//       })
//     );
//     return (
//       await ctx.db.query("messages").withIndex("author").order("desc").collect()
//     ).map(({ author }) => (author === undefined ? "UNDEFINED" : author));
//   });
//   expect(authors).toMatchObject([
//     { a: 1 },
//     ["a"],
//     new ArrayBuffer(8),
//     "xFactor",
//     "stringValue",
//     true,
//     false,
//     35,
//     34,
//     BigInt(34),
//     null,
//     "UNDEFINED",
//   ]);
// });

test("order", async () => {
  const t = convexTest(schema);
  // Test both in and out of transaction ordering
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello1" });
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello2" });
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello3" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello4" });
  });
  const messages = await t.query(api.queries.lastN, { count: 3 });
  expect(messages).toMatchObject([
    { author: "sarah", body: "hello2" },
    { author: "sarah", body: "hello3" },
    { author: "sarah", body: "hello4" },
  ]);
});
