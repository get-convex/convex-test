import { expect, test, vi } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

test("messages", async () => {
  const t = convexTest(schema);
  await t.mutation(api.messages.send, { body: "hello", author: "sarah" });
  await t.mutation(api.messages.send, { body: "hello", author: "tom" });
  const asSarah = t.withIdentity({ name: "sarah" });
  const bySarah = await asSarah.query(api.messages.listByAuth);
  expect(bySarah.length).toEqual(1);
  const all = await t.run((ctx) => {
    return ctx.db.query("messages").collect();
  });
  expect(all.length).toEqual(2);
});

test("ai", async () => {
  const t = convexTest(schema);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ text: async () => "I am the overlord" }) as Response),
  );
  await t.action(api.messages.sendAIMessage, { prompt: "hello" });
  const messages = await t.query(api.messages.list);
  expect(messages).toMatchObject([{ author: "AI", body: "I am the overlord" }]);
  vi.unstubAllGlobals();
});
