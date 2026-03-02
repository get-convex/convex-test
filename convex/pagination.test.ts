import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";
import type { PaginationResult } from "convex/server";

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

test("paginate with maximumRowsRead", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("messages", {
        author: "sarah",
        body: `msg${i}`,
      });
    }
  });

  // With maximumRowsRead=3, we should get at most 3 docs and SplitRequired
  const result = (await t.query(api.pagination.listAll, {
    paginationOptions: {
      cursor: null,
      numItems: 10,
      maximumRowsRead: 3,
    },
  })) as PaginationResult<any>;

  expect(result.page.length).toBeLessThanOrEqual(3);
  expect(result.pageStatus).toEqual("SplitRequired");
  expect(result.splitCursor).toBeTruthy();
  expect(result.isDone).toEqual(false);

  // Continue from the continueCursor
  const result2 = (await t.query(api.pagination.listAll, {
    paginationOptions: {
      cursor: result.continueCursor,
      numItems: 10,
    },
  })) as PaginationResult<any>;

  // Combined pages should cover all 10 docs
  expect(result.page.length + result2.page.length).toEqual(10);
  expect(result2.isDone).toEqual(true);
});

test("paginate with maximumBytesRead", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    for (let i = 0; i < 5; i++) {
      await ctx.db.insert("messages", {
        author: "sarah",
        body: "x".repeat(100),
      });
    }
  });

  // Use a very small byte limit to force early termination
  const result = (await t.query(api.pagination.listAll, {
    paginationOptions: {
      cursor: null,
      numItems: 10,
      maximumBytesRead: 1, // Very small, should stop after first doc
    },
  })) as PaginationResult<any>;

  expect(result.page.length).toBeLessThanOrEqual(1);
  expect(result.pageStatus).toEqual("SplitRequired");
  expect(result.isDone).toEqual(false);
});

test("paginate with filter and maximumRowsRead", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    // Insert many docs, only some match the filter
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("messages", {
        author: i % 3 === 0 ? "sarah" : "michal",
        body: `msg${i}`,
      });
    }
  });

  // Filter for sarah (4 docs: 0, 3, 6, 9), but maximumRowsRead=5
  // means we scan at most 5 rows from the pipeline
  const result = (await t.query(api.pagination.list, {
    author: "sarah",
    paginationOptions: {
      cursor: null,
      numItems: 10,
      maximumRowsRead: 5,
    },
  })) as PaginationResult<any>;

  // Should have scanned 5 rows, getting some sarah docs but not all
  expect(result.pageStatus).toEqual("SplitRequired");
  expect(result.isDone).toEqual(false);
});

test("paginate with endCursor", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    for (let i = 0; i < 5; i++) {
      await ctx.db.insert("messages", {
        author: "sarah",
        body: `msg${i}`,
      });
    }
  });

  // First get a page to get a cursor
  const result1 = (await t.query(api.pagination.listAll, {
    paginationOptions: {
      cursor: null,
      numItems: 2,
    },
  })) as PaginationResult<any>;

  expect(result1.page.length).toEqual(2);
  expect(result1.isDone).toEqual(false);

  // Now get the next page
  const result2 = (await t.query(api.pagination.listAll, {
    paginationOptions: {
      cursor: result1.continueCursor,
      numItems: 2,
    },
  })) as PaginationResult<any>;

  expect(result2.page.length).toEqual(2);

  // Use endCursor to re-fetch the second page bounded
  const result3 = (await t.query(api.pagination.listAll, {
    paginationOptions: {
      cursor: result1.continueCursor,
      numItems: 100, // Large numItems, but bounded by endCursor
      endCursor: result2.continueCursor,
    },
  })) as PaginationResult<any>;

  // Should get the same docs as result2
  expect(result3.page.length).toEqual(result2.page.length);
});
