import { expect, test, vi } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

test("all types serde", async () => {
  const relaxedSchema = defineSchema({
    messages: defineTable({
      body: v.optional(v.any()),
    }).index("body", ["body"]),
  });
  const t = convexTest(relaxedSchema);
  const bodies: any[] = [
    "stringValue",
    undefined,
    true,
    35,
    BigInt(34),
    null,
    ["a"],
    [BigInt(34)],
    { a: 1 },
    { a: BigInt(34) },
    new ArrayBuffer(8),
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -0.0,
    NaN,
  ];
  const messages = await t.run(async (ctx) => {
    await Promise.all(
      bodies.map(async (body) => {
        await ctx.db.insert("messages", { body });
      }),
    );
    return await ctx.db.query("messages").collect();
  });
  const expectBodiesEq = (a: any, b: any) => {
    if (a === undefined) {
      expect(b).toBeUndefined();
    } else {
      expect(b).toMatchObject(a);
    }
  };
  await t.run(async (ctx) => {
    for (const message of messages) {
      // Simple db.get
      const byGet = await ctx.db.get(message._id);
      expect(byGet).not.toBeNull();
      expectBodiesEq(byGet!.body, message.body);
      // Indexed db.query
      const byIndex = await ctx.db.query("messages").withIndex("body", q=>q.eq("body", message.body)).unique();
      expect(byIndex).not.toBeNull();
      expectBodiesEq(byIndex!.body, message.body);
      // Patch
      await ctx.db.patch(message._id, { body: message.body });
      expectBodiesEq((await ctx.db.get(message._id))!.body, message.body);
      // Replace
      await ctx.db.replace(message._id, { body: message.body });
      expectBodiesEq((await ctx.db.get(message._id))!.body, message.body);
    }
  });
});
