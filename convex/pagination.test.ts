import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

test("paginate", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello1" });
    await ctx.db.insert("messages", { author: "michal", body: "boo" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello2" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello3" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello4" });
    await ctx.db.insert("messages", { author: "michal", body: "boing" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello5" });
  });
  const { continueCursor, isDone, page } = await t.query(api.pagination.list, {
    author: "sarah",
    paginationOptions: {
      cursor: null,
      numItems: 2,
    },
  });
  expect(page).toMatchObject([
    { author: "sarah", body: "hello1" },
    { author: "sarah", body: "hello2" },
  ]);
  expect(isDone).toEqual(false);
  const {
    continueCursor: continueCursor2,
    isDone: isDone2,
    page: page2,
  } = await t.query(api.pagination.list, {
    author: "sarah",
    paginationOptions: {
      cursor: continueCursor,
      numItems: 4,
    },
  });
  expect(page2).toMatchObject([
    { author: "sarah", body: "hello3" },
    { author: "sarah", body: "hello4" },
    { author: "sarah", body: "hello5" },
  ]);
  expect(isDone2).toEqual(true);

  // Querying after done should return nothing.
  const { isDone: isDone3, page: page3 } = await t.query(api.pagination.list, {
    author: "sarah",
    paginationOptions: {
      cursor: continueCursor2,
      numItems: 4,
    },
  });
  expect(page3).toMatchObject([]);
  expect(isDone3).toEqual(true);
});

test("paginate with deletes", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello1" });
    await ctx.db.insert("messages", { author: "michal", body: "boo" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello2" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello3" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello4" });
    await ctx.db.insert("messages", { author: "michal", body: "boing" });
    await ctx.db.insert("messages", { author: "sarah", body: "hello5" });
  });
  const { continueCursor, isDone, page } = await t.query(api.pagination.list, {
    author: "sarah",
    paginationOptions: {
      cursor: null,
      numItems: 2,
    },
  });
  expect(page).toMatchObject([
    { author: "sarah", body: "hello1" },
    { author: "sarah", body: "hello2" },
  ]);
  expect(isDone).toEqual(false);
  await t.run(async (ctx) => {
    await ctx.db.delete(page[1]._id);
  });
  const { isDone: isDone2, page: page2 } = await t.query(api.pagination.list, {
    author: "sarah",
    paginationOptions: {
      cursor: continueCursor,
      numItems: 4,
    },
  });
  expect(page2).toMatchObject([
    { author: "sarah", body: "hello3" },
    { author: "sarah", body: "hello4" },
    { author: "sarah", body: "hello5" },
  ]);
  expect(isDone2).toEqual(true);
});

test("paginate with deletes and indexes", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello1" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello1" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello2" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello3" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello4" });
  });
  const { continueCursor, isDone, page } = await t.query(
    api.pagination.listWithIndex,
    {
      author: "jordan",
      paginationOptions: {
        cursor: null,
        numItems: 1,
      },
    },
  );
  expect(page).toMatchObject([{ author: "jordan", body: "hello1" }]);
  expect(isDone).toEqual(false);
  await t.run(async (ctx) => {
    await ctx.db.delete(page[0]._id);
  });
  const {
    isDone: isDone2,
    page: page2,
    continueCursor: continueCursor2,
  } = await t.query(api.pagination.listWithIndex, {
    author: "jordan",
    paginationOptions: {
      cursor: continueCursor,
      numItems: 2,
    },
  });
  expect(page2).toMatchObject([
    { author: "jordan", body: "hello2" },
    { author: "jordan", body: "hello3" },
  ]);
  expect(isDone2).toEqual(false);
  await t.run(async (ctx) => {
    await ctx.db.delete(page2[1]._id);
  });
  const { isDone: isDone3, page: page3 } = await t.query(
    api.pagination.listWithIndex,
    {
      author: "jordan",
      paginationOptions: {
        cursor: continueCursor2,
        numItems: 1,
      },
    },
  );
  expect(page3).toMatchObject([{ author: "jordan", body: "hello4" }]);
  expect(isDone3).toEqual(true);
});

test("paginate with deletes and composite index", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello1" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello2" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello4" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello3" });
    await ctx.db.insert("messages", { author: "jordan", body: "hello1" });
  });
  const { continueCursor, isDone, page } = await t.query(
    api.pagination.listWithCompositeIndex,
    {
      author: "jordan",
      paginationOptions: {
        cursor: null,
        numItems: 1,
      },
    },
  );
  expect(page).toMatchObject([{ author: "jordan", body: "hello1" }]);
  expect(isDone).toEqual(false);
  await t.run(async (ctx) => {
    await ctx.db.delete(page[0]._id);
  });
  const {
    isDone: isDone2,
    page: page2,
    continueCursor: continueCursor2,
  } = await t.query(api.pagination.listWithCompositeIndex, {
    author: "jordan",
    paginationOptions: {
      cursor: continueCursor,
      numItems: 2,
    },
  });
  expect(page2).toMatchObject([
    { author: "jordan", body: "hello2" },
    { author: "jordan", body: "hello3" },
  ]);
  expect(isDone2).toEqual(false);
  await t.run(async (ctx) => {
    await ctx.db.delete(page2[1]._id);
  });
  const { isDone: isDone3, page: page3 } = await t.query(
    api.pagination.listWithCompositeIndex,
    {
      author: "jordan",
      paginationOptions: {
        cursor: continueCursor2,
        numItems: 1,
      },
    },
  );
  expect(page3).toMatchObject([{ author: "jordan", body: "hello4" }]);
  expect(isDone3).toEqual(true);
});
