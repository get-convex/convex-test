import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";
import { Id } from "./_generated/dataModel";

test("insert", async () => {
  const t = convexTest(schema);
  await t.mutation(api.mutations.insert, { body: "hello", author: "sarah" });
  const messages = await t.query(api.messages.list);
  expect(messages).toMatchObject([{ body: "hello", author: "sarah" }]);
});

test("patch", async () => {
  const t = convexTest(schema);
  const id = await t.mutation(api.mutations.insert, {
    body: "hello",
    author: "sarah",
  });
  await t.mutation(api.mutations.patch, { id, body: "hi" });
  const messages = await t.query(api.messages.list);
  expect(messages).toMatchObject([{ body: "hi", author: "sarah" }]);
});

test("replace", async () => {
  const t = convexTest(schema);
  const id = await t.mutation(api.mutations.insert, {
    body: "hello",
    author: "sarah",
  });
  await t.mutation(api.mutations.replace, { id, author: "michal", body: "hi" });
  const messages = await t.query(api.messages.list);
  expect(messages).toMatchObject([{ body: "hi", author: "michal" }]);
});

test("delete", async () => {
  const t = convexTest(schema);
  const id = await t.mutation(api.mutations.insert, {
    body: "hello",
    author: "sarah",
  });
  await t.mutation(api.mutations.deleteDoc, { id });
  const messages = await t.query(api.messages.list);
  expect(messages).toMatchObject([]);
});

test("transaction", async () => {
  const t = convexTest(schema);
  await expect(async () => {
    await t.mutation(api.mutations.throws, { body: "hello", author: "sarah" });
  }).rejects.toThrowError("I changed my mind");

  const messages = await t.query(api.messages.list);
  expect(messages).toMatchObject([]);
});

test("patch with _id", async () => {
  const t = convexTest(schema);
  const id = await t.mutation(api.mutations.insert, {
    body: "hello",
    author: "sarah",
  });

  // should not crash even with `_id` included
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { _id: id });
  });

  // throws if `_id` doesn't match
  await expect(async () => {
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { _id: "nonsense" as Id<"messages"> });
    });
  }).rejects.toThrowError("does not match the document ID");
});

test("patch after insert", async () => {
  const t = convexTest(schema);
  const messages = await t.run(async (ctx) => {
    const id = await ctx.db.insert("messages", {
      body: "hello",
      author: "sarah",
    });
    await ctx.db.patch(id, { body: "hi" });
    return ctx.db.query("messages").collect();
  });
  expect(messages).toMatchObject([{ body: "hi", author: "sarah" }]);
});

test("replace after insert", async () => {
  const t = convexTest(schema);
  const messages = await t.run(async (ctx) => {
    const id = await ctx.db.insert("messages", {
      body: "hello",
      author: "sarah",
    });
    await ctx.db.replace(id, { author: "michal", body: "hi" });
    return ctx.db.query("messages").collect();
  });
  expect(messages).toMatchObject([{ body: "hi", author: "michal" }]);
});
