import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

function schemaWithStripUnknownKeys() {
  const stripSchema = defineSchema({
    messages: defineTable({ author: v.string() }),
  });
  const table = stripSchema.tables.messages as any;
  const originalExport = table.export.bind(table);
  table.export = () => {
    const exported = originalExport();
    return {
      ...exported,
      documentType: {
        ...exported.documentType,
        unknownKeys: "strip",
      },
    };
  };
  return stripSchema;
}

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
      }),
  ).rejects.toThrowError("Validator error");
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
      }),
  ).rejects.toThrowError("Validator error");
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
      }),
  ).rejects.toThrowError("Validator error");
});

test("arrays", async () => {
  const t = convexTest(
    defineSchema({
      messages: defineTable({
        values: v.array(v.number()),
      }),
    }),
  );
  await expect(
    async () =>
      await t.run(async (ctx) => {
        await ctx.db.insert("messages", {
          values: ["bad" as any],
        });
      }),
  ).rejects.toThrowError("Validator error");
});

test("ids", async () => {
  const t = convexTest(
    defineSchema({
      messages: defineTable({
        author: v.optional(v.id("users")),
      }),
    }),
  );
  await expect(
    async () =>
      await t.run(async (ctx) => {
        await ctx.db.insert("messages", {
          author: "no bueno" as any,
        });
      }),
  ).rejects.toThrowError("Validator error");
  await expect(
    async () =>
      await t.run(async (ctx) => {
        const messageId = await ctx.db.insert("messages", {});
        await ctx.db.insert("messages", {
          author: messageId as any,
        });
      }),
  ).rejects.toThrowError("Validator error");
});

test("schema validation off", async () => {
  const t = convexTest(
    defineSchema(
      {
        messages: defineTable({
          author: v.string(),
        }),
      },
      { schemaValidation: false },
    ),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", {
      author: 3,
      extraField: true,
    } as any);
  });
});

test("extra fields are stripped on insert in strip mode", async () => {
  const t = convexTest(schemaWithStripUnknownKeys());
  const doc = await t.run(async (ctx) => {
    const id = await ctx.db.insert("messages", {
      author: "sarah",
      extraField: true,
    } as any);
    return await ctx.db.get(id);
  });
  expect(doc).not.toBeNull();
  expect(doc!.author).toEqual("sarah");
  expect((doc as any).extraField).toBeUndefined();
});

test("extra fields are stripped on patch in strip mode", async () => {
  const t = convexTest(schemaWithStripUnknownKeys());
  const doc = await t.run(async (ctx) => {
    const id = await ctx.db.insert("messages", {
      author: "sarah",
    });
    await ctx.db.patch(id, { extraField: true } as any);
    return await ctx.db.get(id);
  });
  expect(doc).not.toBeNull();
  expect(doc!.author).toEqual("sarah");
  expect((doc as any).extraField).toBeUndefined();
});

test("extra fields are stripped on replace in strip mode", async () => {
  const t = convexTest(schemaWithStripUnknownKeys());
  const doc = await t.run(async (ctx) => {
    const id = await ctx.db.insert("messages", {
      author: "sarah",
    });
    await ctx.db.replace(id, { author: "tom", extraField: true } as any);
    return await ctx.db.get(id);
  });
  expect(doc).not.toBeNull();
  expect(doc!.author).toEqual("tom");
  expect((doc as any).extraField).toBeUndefined();
});

test("strip mode still validates field types", async () => {
  const t = convexTest(schemaWithStripUnknownKeys());
  await expect(
    async () =>
      await t.run(async (ctx) => {
        await ctx.db.insert("messages", {
          author: 3,
          extraField: true,
        } as any);
      }),
  ).rejects.toThrowError("Validator error");
});
