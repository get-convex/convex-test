import { expect, test } from "vitest";
import { convexTest, getDb } from "../syscalls";
import { api } from "./_generated/api";
import schema from "./schema";

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
  }).rejects.toThrow("I changed my mind");

  const messages = await t.query(api.messages.list);
  expect(messages).toMatchObject([]);
});
