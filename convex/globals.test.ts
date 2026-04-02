import { expect, test } from "vitest";
import { convexTest } from "../index";
import { internal } from "./_generated/api";
import schema from "./schema";

test("mutation: nested query sees real globals, not patched ones", async () => {
  const t = convexTest(schema);
  const result = await t.mutation(internal.globals.mutationPatchingGlobal);
  // Handler sees its own patch
  expect(result.before).toBe("patched-by-mutation");
  // Nested query sees real atob
  expect(result.nested).toBe("hello");
  // After nested call, patch is restored
  expect(result.after).toBe("patched-by-mutation");
});

test("action: nested mutation sees real globals, not patched ones", async () => {
  const t = convexTest(schema);
  const result = await t.action(internal.globals.actionPatchingGlobal);
  expect(result.before).toBe("patched-by-action");
  expect(result.nested).toBe("hello");
  expect(result.after).toBe("patched-by-action");
});

test("nested action gets its own global context", async () => {
  const t = convexTest(schema);
  const result = await t.action(internal.globals.actionPatchingGlobalNested);
  // Outer sees its own patch before and after
  expect(result.outerBefore).toBe("patched-by-outer");
  expect(result.outerAfter).toBe("patched-by-outer");
  // Inner starts with real atob, then patches its own
  expect(result.inner.before).toBe("hello");
  expect(result.inner.after).toBe("patched-by-inner");
});

test("parallel actions have isolated globals", async () => {
  const t = convexTest(schema);
  const [resultA, resultB] = await Promise.all([
    t.action(internal.globals.actionPatchA, { delayMs: 10 }),
    t.action(internal.globals.actionPatchB, { delayMs: 10 }),
  ]);
  // Each action should see only its own patch
  expect(resultA).toBe("patched-A");
  expect(resultB).toBe("patched-B");
});

test("globals are clean after handler that patched them", async () => {
  const t = convexTest(schema);
  // First, run an action that patches atob
  await t.action(internal.globals.actionPatchingGlobal);
  // Then run a fresh action — it should see the real atob
  const result = await t.action(internal.globals.readAtobAction);
  expect(result).toBe("hello");
});

test("inline mutation: patched globals restored after nested query", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "test", body: "hi" });
  });

  const result = await t.mutation(async (ctx) => {
    (globalThis as any).atob = () => "patched-inline";
    const before = globalThis.atob("ignored");
    const docs = await ctx.db.query("messages").collect();
    const after = globalThis.atob("ignored");
    return { before, after, count: docs.length };
  });

  expect(result.before).toBe("patched-inline");
  // atob should still be patched after the db query (same handler context)
  expect(result.after).toBe("patched-inline");
  expect(result.count).toBe(1);
});
