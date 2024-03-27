import { expect, test } from "vitest";
import { convexTest } from "../syscalls";
import { api } from "./_generated/api";
import schema from "./schema";

test("paginate", async () => {
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
