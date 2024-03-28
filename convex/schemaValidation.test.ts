import { expect, test } from "vitest";
import { convexTest } from "../syscalls";
import schema from "./schema";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

test("extra fields", async () => {
  const t = convexTest(schema);
  await expect(
    async () =>
      await t.run(async (ctx) => {
        await ctx.db.insert("messages", {
          author: "sarah",
          body: "hello1",
          extraField: true,
        } as any);
      })
  ).rejects.toThrowError(/Validator error/);
});

test("patch", async () => {
  const t = convexTest(schema);
  await expect(
    async () =>
      await t.run(async (ctx) => {
        const id = await ctx.db.insert("messages", {
          author: "sarah",
          body: "hello",
        });
        await ctx.db.patch(id, { author: false as any });
      })
  ).rejects.toThrowError(/Validator error/);
});

test("replace", async () => {
  const t = convexTest(schema);
  await expect(
    async () =>
      await t.run(async (ctx) => {
        const id = await ctx.db.insert("messages", {
          author: "sarah",
          body: "hello",
        });
        await ctx.db.replace(id, { author: null as any, body: "hey" });
      })
  ).rejects.toThrowError(/Validator error/);
});

test("arrays", async () => {
  const t = convexTest(
    defineSchema({
      messages: defineTable({
        values: v.array(v.number()),
      }),
    })
  );
  await expect(
    async () =>
      await t.run(async (ctx) => {
        await ctx.db.insert("messages", {
          values: ["bad" as any],
        });
      })
  ).rejects.toThrowError(/Validator error/);
});
