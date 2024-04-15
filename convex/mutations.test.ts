import { expect, test } from "vitest";
import { convexTest } from "../index";
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

  // should not crash even with `_id` included
  await t.mutation(api.mutations.patch, { id, body: "hi", extraProperties: { _id: id } });

  // throws if `_id` doesn't match
  await expect(t.mutation(api.mutations.patch, { id, body: "hi", extraProperties: { _id: "nonsense" } })).rejects.toThrow(/does not match '_id' field/)
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
