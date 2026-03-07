import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";

test("default: limits disabled, no throws", async () => {
  const t = convexTest(schema);
  // Insert many docs without hitting limits (default is disabled)
  await t.run(async (ctx) => {
    for (let i = 0; i < 100; i++) {
      await ctx.db.insert("messages", {
        author: "sarah",
        body: "x".repeat(1000),
      });
    }
  });
  // Read them all back
  const result = await t.query(async (ctx) => {
    return await ctx.db.query("messages").collect();
  });
  expect(result.length).toEqual(100);
});

test("read byte limit exceeded throws", async () => {
  const t = convexTest(schema, undefined, {
    transactionLimits: {
      bytesRead: 500,
      documentsRead: 100000,
      databaseQueries: 100,
    },
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("messages", {
        author: "sarah",
        body: "x".repeat(200),
      });
    }
  });
  await expect(
    t.query(async (ctx) => {
      return await ctx.db.query("messages").collect();
    }),
  ).rejects.toThrow(/Read too much data/);
});

const MiB = 1 << 20;

test("read document limit exceeded throws", async () => {
  const t = convexTest(schema, undefined, {
    transactionLimits: {
      bytesRead: 16 * MiB,
      documentsRead: 5,
      databaseQueries: 100,
    },
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("messages", { author: "sarah", body: `msg${i}` });
    }
  });
  await expect(
    t.query(async (ctx) => {
      return await ctx.db.query("messages").collect();
    }),
  ).rejects.toThrow(/Scanned too many documents/);
});

test("write byte limit exceeded throws", async () => {
  const t = convexTest(schema, undefined, {
    transactionLimits: {
      bytesWritten: 500,
      documentsWritten: 100000,
    },
  });
  await expect(
    t.mutation(async (ctx) => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("messages", {
          author: "sarah",
          body: "x".repeat(200),
        });
      }
    }),
  ).rejects.toThrow(/Wrote too much data/);
});

test("write document limit exceeded throws", async () => {
  const t = convexTest(schema, undefined, {
    transactionLimits: {
      bytesWritten: 16 * MiB,
      documentsWritten: 3,
    },
  });
  await expect(
    t.mutation(async (ctx) => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("messages", { author: "sarah", body: `msg${i}` });
      }
    }),
  ).rejects.toThrow(/Wrote too many documents/);
});

test("index range limit exceeded throws", async () => {
  const t = convexTest(schema, undefined, {
    transactionLimits: {
      bytesRead: 16 * MiB,
      documentsRead: 100000,
      databaseQueries: 2,
    },
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello" });
  });
  await expect(
    t.query(async (ctx) => {
      // Each db.get counts as one index range read
      const docs = await ctx.db.query("messages").collect();
      await ctx.db.get(docs[0]._id);
      await ctx.db.get(docs[0]._id);
      // The query itself used one range, plus two gets = 3 total, limit is 2
    }),
  ).rejects.toThrow(/Too many index ranges/);
});

test("limits accumulate within a transaction", async () => {
  const t = convexTest(schema, undefined, {
    transactionLimits: {
      bytesRead: 16 * MiB,
      documentsRead: 5,
      databaseQueries: 2,
    },
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("messages", { author: "sarah", body: `msg${i}` });
    }
  });
  // A mutation that reads more docs than the limit
  await expect(
    t.mutation(async (ctx) => {
      // Reading 10 docs exceeds the limit of 5
      return await ctx.db.query("messages").collect();
    }),
  ).rejects.toThrow(/Scanned too many documents/);
});

test("getTransactionHeadroom returns bandwidth stats", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello" });
    await ctx.db.insert("messages", { author: "michal", body: "world" });
  });
  const consumption = await t.query(async (ctx) => {
    await ctx.db.query("messages").collect();
    // TODO: replace with getTransactionHeadroom() once it's published
    const syscalls = (global as any).Convex;
    return JSON.parse(
      await syscalls.asyncSyscall("1.0/headroom", JSON.stringify({})),
    );
  });
  // Should have read some bytes and documents
  expect(consumption.documentsRead.used).toBeGreaterThan(0);
  expect(consumption.bytesRead.used).toBeGreaterThan(0);
  expect(consumption.databaseQueries.used).toBeGreaterThan(0);
});
