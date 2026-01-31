import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import {
  countMessages,
  getMessageBodies,
  getMessagesByAuthor,
  insertMessage,
  insertMessages,
} from "./helpers";

test("query helper: getMessagesByAuthor", async () => {
  const t = convexTest(schema);
  await t.mutation(async (ctx) => {
    await ctx.db.insert("messages", { author: "alice", body: "hello" });
    await ctx.db.insert("messages", { author: "bob", body: "world" });
    await ctx.db.insert("messages", { author: "alice", body: "goodbye" });
  });

  const aliceMessages = await t.query(async (ctx) =>
    getMessagesByAuthor(ctx, "alice"),
  );
  expect(aliceMessages).toHaveLength(2);
  expect(aliceMessages).toMatchObject([
    { author: "alice", body: "hello" },
    { author: "alice", body: "goodbye" },
  ]);

  const bobMessages = await t.query(async (ctx) =>
    getMessagesByAuthor(ctx, "bob"),
  );
  expect(bobMessages).toMatchObject([{ author: "bob", body: "world" }]);
});

test("query helper: countMessages", async () => {
  const t = convexTest(schema);

  const emptyCount = await t.query(async (ctx) => countMessages(ctx));
  expect(emptyCount).toBe(0);

  await t.mutation(async (ctx) => {
    await ctx.db.insert("messages", { author: "alice", body: "one" });
    await ctx.db.insert("messages", { author: "bob", body: "two" });
    await ctx.db.insert("messages", { author: "charlie", body: "three" });
  });

  const count = await t.query(async (ctx) => countMessages(ctx));
  expect(count).toBe(3);
});

test("query helper: getMessageBodies (helper calling helper)", async () => {
  const t = convexTest(schema);
  await t.mutation(async (ctx) => {
    await ctx.db.insert("messages", { author: "alice", body: "first" });
    await ctx.db.insert("messages", { author: "alice", body: "second" });
    await ctx.db.insert("messages", { author: "bob", body: "other" });
  });

  const bodies = await t.query(async (ctx) => getMessageBodies(ctx, "alice"));
  expect(bodies).toEqual(["first", "second"]);
});

test("mutation helper: insertMessage", async () => {
  const t = convexTest(schema);

  const id = await t.mutation(async (ctx) =>
    insertMessage(ctx, "alice", "hello"),
  );
  expect(id).toBeDefined();

  const messages = await t.query(async (ctx) =>
    getMessagesByAuthor(ctx, "alice"),
  );
  expect(messages).toMatchObject([{ author: "alice", body: "hello" }]);
});

test("mutation helper: insertMessages", async () => {
  const t = convexTest(schema);

  const ids = await t.mutation(async (ctx) =>
    insertMessages(ctx, [
      { author: "alice", body: "one" },
      { author: "alice", body: "two" },
      { author: "bob", body: "three" },
    ]),
  );
  expect(ids).toHaveLength(3);

  const count = await t.query(async (ctx) => countMessages(ctx));
  expect(count).toBe(3);

  const aliceBodies = await t.query(async (ctx) =>
    getMessageBodies(ctx, "alice"),
  );
  expect(aliceBodies).toEqual(["one", "two"]);
});

test("mixing helpers with inline logic", async () => {
  const t = convexTest(schema);

  await t.mutation(async (ctx) => {
    await insertMessage(ctx, "alice", "hello");
    // Mix helper with direct db access
    await ctx.db.insert("messages", { author: "alice", body: "world" });
  });

  const result = await t.query(async (ctx) => {
    const messages = await getMessagesByAuthor(ctx, "alice");
    // Process results with inline logic
    return messages.map((m) => m.body.toUpperCase());
  });
  expect(result).toEqual(["HELLO", "WORLD"]);
});

test("helpers with identity", async () => {
  const t = convexTest(schema);
  const authT = t.withIdentity({ name: "Test User" });

  await authT.mutation(async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    await insertMessage(ctx, identity!.name!, "authenticated message");
  });

  const messages = await authT.query(async (ctx) =>
    getMessagesByAuthor(ctx, "Test User"),
  );
  expect(messages).toMatchObject([
    { author: "Test User", body: "authenticated message" },
  ]);
});
