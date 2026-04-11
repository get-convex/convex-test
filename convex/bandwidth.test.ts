import { expect, test } from "vitest";
import { getDocumentSize } from "convex/values";
import { convexTest } from "../index";
import schema from "./schema";

test("default: limits disabled, no throws", async () => {
  const t = convexTest({ schema });
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
  const t = convexTest({
    schema,
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
  const t = convexTest({
    schema,
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
  const t = convexTest({
    schema,
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
  const t = convexTest({
    schema,
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
  const t = convexTest({
    schema,
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
  const t = convexTest({
    schema,
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

test("getTransactionMetrics returns bandwidth stats", async () => {
  const t = convexTest({ schema });
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "sarah", body: "hello" });
    await ctx.db.insert("messages", { author: "michal", body: "world" });
  });
  const { consumption, totalBytes } = await t.query(async (ctx) => {
    const docs = await ctx.db.query("messages").collect();
    const totalBytes = docs.reduce((sum, doc) => sum + getDocumentSize(doc), 0);
    const syscalls = (global as any).Convex;
    const consumption = JSON.parse(
      await syscalls.asyncSyscall(
        "1.0/getTransactionMetrics",
        JSON.stringify({}),
      ),
    );
    return { consumption, totalBytes };
  });
  expect(consumption.documentsRead.used).toBe(2);
  expect(consumption.bytesRead.used).toBe(totalBytes);
  expect(consumption.databaseQueries.used).toBe(1);
  expect(consumption.documentsRead.remaining).toBe(32000 - 2);
  expect(consumption.bytesRead.remaining).toBe((16 << 20) - totalBytes);
  expect(consumption.bytesWritten.used).toBe(0);
  expect(consumption.documentsWritten.used).toBe(0);
  expect(consumption.functionsScheduled.used).toBe(0);
  expect(consumption.scheduledFunctionArgsBytes.used).toBe(0);
});

test("getTransactionMetrics tracks writes", async () => {
  const t = convexTest({ schema });
  const { consumption, docBytes } = await t.mutation(async (ctx) => {
    const id = await ctx.db.insert("messages", {
      author: "sarah",
      body: "hello",
    });
    const doc = (await ctx.db.get(id))!;
    const docBytes = getDocumentSize(doc);
    const syscalls = (global as any).Convex;
    const consumption = JSON.parse(
      await syscalls.asyncSyscall(
        "1.0/getTransactionMetrics",
        JSON.stringify({}),
      ),
    );
    return { consumption, docBytes };
  });
  expect(consumption.documentsWritten.used).toBe(1);
  expect(consumption.bytesWritten.used).toBe(docBytes);
});
