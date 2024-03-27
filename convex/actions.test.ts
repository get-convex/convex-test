import { expect, test } from "vitest";
import { convexTest } from "../syscalls";
import { api, internal } from "./_generated/api";
import schema from "./schema";

test("action calling query", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { body: "foo", author: "test" });
  });
  const result = await t.action(internal.actions.actionCallingQuery);
  expect(result.length).toEqual(1);
  expect(result[0].body).toEqual("foo");
  expect(result[0].author).toEqual("test");
});

test("action calling mutation", async () => {
  const t = convexTest(schema);
  await t.action(api.actions.actionCallingMutation, { body: "heya" });
  const result = await t.query(internal.actions.list);
  expect(result.length).toEqual(1);
  expect(result[0].body).toEqual("heya");
  expect(result[0].author).toEqual("AI");
});

test("action calling action", async () => {
  const t = convexTest(schema);
  const result = await t.action(internal.actions.actionCallingAction, {
    count: 2,
  });
  expect(result.called).toEqual(2);
});
