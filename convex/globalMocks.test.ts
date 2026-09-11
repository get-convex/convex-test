import { expect, test, vi } from "vitest";
import { convexTest } from "../index";
import { internal } from "./_generated/api";
import schema from "./schema";

// Keep this first so the stub is installed before any call to convexTest.
test("restoring a global stub installed before initialization preserves isolation", async () => {
  const originalAtob = globalThis.atob;
  vi.stubGlobal("atob", () => "test mock");
  try {
    const t = convexTest(schema);
    expect(await t.action(internal.globals.readAtobAction)).toBe("test mock");

    vi.unstubAllGlobals();
    expect(globalThis.atob).toBe(originalAtob);
    expect(await t.action(internal.globals.actionPatchingGlobal)).toEqual({
      before: "patched-by-action",
      nested: "hello",
      after: "patched-by-action",
    });
    expect(globalThis.atob).toBe(originalAtob);
  } finally {
    vi.unstubAllGlobals();
    globalThis.atob = originalAtob;
  }
});

test("global stubs installed after initialization survive nested calls and repeated cleanup", async () => {
  const t = convexTest(schema);
  const originalAtob = globalThis.atob;
  for (const value of ["first mock", "second mock"]) {
    const mockAtob = vi.fn(() => value);
    vi.stubGlobal("atob", mockAtob);
    try {
      expect(await t.action(internal.globals.actionPatchingGlobal)).toEqual({
        before: "patched-by-action",
        nested: value,
        after: "patched-by-action",
      });
      expect(globalThis.atob).toBe(mockAtob);
      await expect(
        t.action(async () => {
          globalThis.atob = () => "patched-before-error";
          throw new Error("handler failed");
        }),
      ).rejects.toThrow("handler failed");
      expect(globalThis.atob).toBe(mockAtob);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(globalThis.atob).toBe(originalAtob);
    expect(await t.query(internal.globals.readAtob)).toBe("hello");
  }
});

test.each(["action", "query", "mutation", "run"] as const)(
  "%s preserves runtime restrictions after stubbing fetch",
  async (method) => {
    const t = convexTest(schema);
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn(async () => new Response("test mock"));
    const readFetch = async () =>
      (await fetch("https://unused.invalid")).text();
    const call = {
      action: () => t.action(readFetch),
      query: () => t.query(readFetch),
      mutation: () => t.mutation(readFetch),
      run: () => t.run(readFetch),
    }[method];
    vi.stubGlobal("fetch", mockFetch);
    try {
      if (method === "action") {
        expect(await call()).toBe("test mock");
        expect(mockFetch).toHaveBeenCalledTimes(1);
      } else {
        await expect(call()).rejects.toThrow("`fetch` is not supported");
        expect(mockFetch).not.toHaveBeenCalled();
      }
    } finally {
      vi.unstubAllGlobals();
    }
    expect(globalThis.fetch).toBe(originalFetch);
  },
);

test("HTTP handlers isolate overrides of globals stubbed in test setup", async () => {
  const t = convexTest(schema);
  const mockAtob = vi.fn(() => "test mock");
  vi.stubGlobal("atob", mockAtob);
  try {
    const response = await t.fetch("/globals?patch=patched-http");
    expect(await response.json()).toEqual({
      before: "patched-http",
      nested: "test mock",
      after: "patched-http",
    });
    expect(globalThis.atob).toBe(mockAtob);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("finishing one action preserves a concurrent action's global overrides", async () => {
  const t = convexTest(schema);
  const mockAtob = vi.fn(() => "test mock");
  vi.stubGlobal("atob", mockAtob);
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = t.action(async () => {
    globalThis.atob = () => "first action";
    entered();
    await gate;
    return atob("");
  });
  try {
    await ready;
    expect(
      await t.action(async () => {
        const before = atob("");
        globalThis.atob = () => "second action";
        return { before, after: atob("") };
      }),
    ).toEqual({ before: "test mock", after: "second action" });
    expect(globalThis.atob).toBe(mockAtob);
    release();
    expect(await first).toBe("first action");
  } finally {
    release();
    await first;
    vi.unstubAllGlobals();
  }
});
