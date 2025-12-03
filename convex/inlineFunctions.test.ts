import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

test("inline query", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello1" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello2" });
  });
  const messages = await t.query(async (ctx) => {
    return await ctx.db.query("messages").collect();
  });
  expect(messages).toMatchObject([
    { author: "sarah", body: "hello1" },
    { author: "sarah", body: "hello2" },
  ]);
});

test("inline mutation insert", async () => {
  const t = convexTest(schema);
  const id = await t.mutation(async (ctx) => {
    return await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  expect(id).toBeDefined();
  const messages = await t.query(async (ctx) => {
    return await ctx.db.query("messages").collect();
  });
  expect(messages).toMatchObject([{ author: "sarah", body: "hello" }]);
});

test("inline mutation patch", async () => {
  const t = convexTest(schema);
  const id = await t.mutation(async (ctx) => {
    return await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  await t.mutation(async (ctx) => {
    await ctx.db.patch(id, { body: "updated" });
  });
  const message = await t.query(async (ctx) => {
    return await ctx.db.get(id);
  });
  expect(message).toMatchObject({ author: "sarah", body: "updated" });
});

test("inline mutation delete", async () => {
  const t = convexTest(schema);
  const id = await t.mutation(async (ctx) => {
    return await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  await t.mutation(async (ctx) => {
    await ctx.db.delete(id);
  });
  const message = await t.query(async (ctx) => {
    return await ctx.db.get(id);
  });
  expect(message).toBeNull();
});

test("inline query is read-only (no db.insert)", async () => {
  const t = convexTest(schema);
  await expect(async () => {
    await t.query(async (ctx) => {
      // @ts-expect-error - queries should not have insert
      await ctx.db.insert("messages", { author: "sarah", body: "hello" });
    });
  }).rejects.toThrow();
});

test("inline mutation transaction rollback", async () => {
  const t = convexTest(schema);
  await expect(async () => {
    await t.mutation(async (ctx) => {
      await ctx.db.insert("messages", { author: "sarah", body: "hello" });
      throw new Error("rollback");
    });
  }).rejects.toThrowError("rollback");

  const messages = await t.query(async (ctx) => {
    return await ctx.db.query("messages").collect();
  });
  expect(messages).toMatchObject([]);
});

test("inline functions with identity", async () => {
  const t = convexTest(schema);
  const identity = await t
    .withIdentity({ name: "Test User" })
    .query(async (ctx) => {
      return await ctx.auth.getUserIdentity();
    });
  expect(identity).toMatchObject({ name: "Test User" });
});

test("inline query returns value", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  const count = await t.query(async (ctx) => {
    const messages = await ctx.db.query("messages").collect();
    return messages.length + 41;
  });
  expect(count).toBe(42);
});

test("inline mutation returns inserted id", async () => {
  const t = convexTest(schema);
  const id = await t.mutation(async (ctx) => {
    const insertedId = await ctx.db.insert("messages", {
      author: "sarah",
      body: "hello",
    });
    return insertedId;
  });
  expect(typeof id).toBe("string");
  expect(id).toContain("messages");
});

test("inline action basic", async () => {
  const t = convexTest(schema);
  const result = await t.action(async () => {
    return "hello from action";
  });
  expect(result).toBe("hello from action");
});

test("inline action with return value", async () => {
  const t = convexTest(schema);
  const result = await t.action(async () => {
    return { count: 42, message: "success" };
  });
  expect(result).toEqual({ count: 42, message: "success" });
});

test("inline action calling function reference via ctx.runQuery", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  const result = await t.action(async (ctx) => {
    const messages = await ctx.runQuery(api.queries.list);
    return messages;
  });
  expect(result).toMatchObject([{ author: "sarah", body: "hello" }]);
});

test("inline action calling function reference via ctx.runMutation", async () => {
  const t = convexTest(schema);
  await t.action(async (ctx) => {
    await ctx.runMutation(api.mutations.insert, {
      author: "action",
      body: "test",
    });
  });
  const messages = await t.query(async (ctx) => {
    return await ctx.db.query("messages").collect();
  });
  expect(messages).toMatchObject([{ author: "action", body: "test" }]);
});

test("inline action with identity", async () => {
  const t = convexTest(schema);
  const identity = await t
    .withIdentity({ name: "Action User" })
    .action(async (ctx) => {
      return await ctx.auth.getUserIdentity();
    });
  expect(identity).toMatchObject({ name: "Action User" });
});
