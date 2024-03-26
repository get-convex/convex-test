import { expect, test } from "vitest";
import { convexTest } from "../syscalls";
import { api, internal } from "./_generated/api";
import schema from "./schema";

test("action calling action", async () => {
  const t = convexTest(schema);
  const result = await t.action(internal.arbitrary.actionCallingAction, {
    count: 2,
  });
  expect(result.called).toEqual(2);
});

test("action calling query", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("foos", { name: "foo" });
  });
  const result = await t.action(internal.arbitrary.actionCallingQuery, {});
  expect(result.length).toEqual(1);
  expect(result[0].name).toEqual("foo");
});
