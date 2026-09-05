import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api, internal } from "./_generated/api";
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

test("nested mutations do not consume the caller's random sequence", async () => {
  const t = convexTest(schema);
  const sample = (runNested: boolean) =>
    t.mutation(async (ctx) => {
      const originalMath = Math;
      const patchedMath: Math = Object.create(originalMath);
      let draws = 0;
      patchedMath.random = () => ++draws / 10;
      globalThis.Math = patchedMath;
      try {
        const before = Math.random();
        if (runNested) {
          await ctx.runMutation(internal.globals.consumeRandom);
        }
        return [before, Math.random()];
      } finally {
        globalThis.Math = originalMath;
      }
    });

  // Replaying a recorded child result must not change the caller's sequence.
  expect(await sample(true)).toEqual([0.1, 0.2]);
  expect(await sample(false)).toEqual([0.1, 0.2]);
});

test.each(["process", "Crypto", "crypto", "CryptoKey", "SubtleCrypto"])(
  "assigning undefined to %s is isolated from nested calls and the test",
  async (name) => {
    const t = convexTest(schema);
    const globals = globalThis as Record<string, unknown>;
    const original = globals[name];
    expect(original).toBeDefined();
    const originalType = await t.query(internal.globals.readGlobalType, {
      name,
    });
    try {
      const result = await t.mutation(async (ctx) => {
        globals[name] = undefined;
        const before = typeof globals[name];
        const nested = await ctx.runQuery(internal.globals.readGlobalType, {
          name,
        });
        return { before, nested, after: typeof globals[name] };
      });

      expect(globals[name] === original).toBe(true);
      expect(result).toEqual({
        before: "undefined",
        nested: originalType,
        after: "undefined",
      });
    } finally {
      // Keep the runner usable even when isolation regresses for process.
      globals[name] = original;
    }
  },
);

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
    t.action(api.globals.actionPatchA, { delayMs: 10 }),
    t.action(api.globals.actionPatchB, { delayMs: 10 }),
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

test("query: fetch is not supported", async () => {
  const t = convexTest(schema);
  await expect(t.query(internal.globals.queryUsingFetch)).rejects.toThrow(
    /`fetch` is not supported/,
  );
});

test("mutation: fetch is not supported", async () => {
  const t = convexTest(schema);
  await expect(t.mutation(internal.globals.mutationUsingFetch)).rejects.toThrow(
    /`fetch` is not supported/,
  );
});

test("mutation: setTimeout is not supported", async () => {
  const t = convexTest(schema);
  await expect(
    t.mutation(internal.globals.mutationUsingSetTimeout),
  ).rejects.toThrow(/`setTimeout` is not supported/);
});

test("query: setInterval is not supported", async () => {
  const t = convexTest(schema);
  await expect(t.query(internal.globals.queryUsingSetInterval)).rejects.toThrow(
    /`setInterval` is not supported/,
  );
});

test("inline mutation via t.run: fetch is not supported", async () => {
  const t = convexTest(schema);
  await expect(
    t.run(async () => {
      await fetch("https://example.com");
    }),
  ).rejects.toThrow(/`fetch` is not supported/);
});

test("mutation can override the disallowed fetch sentinel", async () => {
  const t = convexTest(schema);
  const result = await t.mutation(internal.globals.mutationOverridingFetch);
  expect(result).toBe('{"ok":true}');
});

test("action: setTimeout still works", async () => {
  const t = convexTest(schema);
  const result = await t.action(internal.globals.actionUsingSetTimeout);
  expect(result).toBe("ok");
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
