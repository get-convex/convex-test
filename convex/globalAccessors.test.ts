import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";

const originalAtob = Object.getOwnPropertyDescriptor(globalThis, "atob")!;
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(globalThis, "atob", originalAtob);
});

test("global getters stay live across reads and mock restoration", async () => {
  const t = convexTest(schema);
  let implementation = () => "first";
  Object.defineProperty(globalThis, "atob", {
    configurable: true,
    get() {
      expect(this).toBe(globalThis);
      return implementation;
    },
    set: undefined,
  });

  expect(await t.action(async () => atob(""))).toBe("first");
  implementation = () => "second";
  expect(await t.action(async () => atob(""))).toBe("second");

  vi.stubGlobal("atob", () => "mock");
  expect(await t.action(async () => atob(""))).toBe("mock");
  vi.unstubAllGlobals();
  implementation = () => "restored";
  expect(await t.action(async () => atob(""))).toBe("restored");
});

test("installing global accessors does not evaluate getters", async () => {
  const t = convexTest(schema);
  const get = vi.fn(() => {
    throw new Error("getter called");
  });
  Object.defineProperty(globalThis, "atob", {
    configurable: true,
    get,
    set: undefined,
  });

  expect(await t.action(async () => "ok")).toBe("ok");
  expect(get).not.toHaveBeenCalled();
  await expect(t.action(async () => atob(""))).rejects.toThrow("getter called");
  expect(get).toHaveBeenCalledTimes(1);
});

test("global setters handle shared assignments but not handler overrides", async () => {
  const t = convexTest(schema);
  let implementation = () => "initial";
  const set = vi.fn(function (this: unknown, value: typeof atob) {
    expect(this).toBe(globalThis);
    implementation = () => value("");
  });
  Object.defineProperty(globalThis, "atob", {
    configurable: true,
    get: () => implementation,
    set,
  });
  await t.action(async () => null);

  globalThis.atob = () => "shared";
  expect(set).toHaveBeenCalledTimes(1);
  expect(atob("")).toBe("shared");
  expect(
    await t.action(async () => {
      globalThis.atob = () => "local";
      return atob("");
    }),
  ).toBe("local");
  expect(set).toHaveBeenCalledTimes(1);
  expect(atob("")).toBe("shared");
});

test.each(["getter only", "non-writable data"])(
  "%s globals reject shared assignments but allow handler overrides",
  async (kind) => {
    const t = convexTest(schema);
    Object.defineProperty(
      globalThis,
      "atob",
      kind === "getter only"
        ? { configurable: true, get: () => () => "shared", set: undefined }
        : { configurable: true, value: () => "shared", writable: false },
    );
    expect(await t.action(async () => atob(""))).toBe("shared");
    expect(() => {
      globalThis.atob = () => "changed";
    }).toThrow(TypeError);
    expect(
      await t.action(async () => {
        globalThis.atob = () => "local";
        return atob("");
      }),
    ).toBe("local");
    expect(atob("")).toBe("shared");
  },
);

test("global getters use the reading handler's context", async () => {
  const t = convexTest(schema);
  const sharedBtoa = globalThis.btoa;
  Object.defineProperty(globalThis, "atob", {
    configurable: true,
    get: () => globalThis.btoa,
    set: undefined,
  });
  expect(
    await t.action(async () => {
      globalThis.btoa = () => "parent";
      const before = atob("");
      const nested = await t.action(async () => {
        const before = atob("hello");
        globalThis.btoa = () => "child";
        return { before, after: atob("") };
      });
      return { before, nested, after: atob("") };
    }),
  ).toEqual({
    before: "parent",
    nested: { before: sharedBtoa("hello"), after: "child" },
    after: "parent",
  });
  expect(globalThis.atob).toBe(sharedBtoa);
});

test("global getters follow overlapping handlers independently", async () => {
  const firstTest = convexTest(schema);
  const secondTest = convexTest(schema);
  Object.defineProperty(globalThis, "atob", {
    configurable: true,
    get: () => globalThis.btoa,
    set: undefined,
  });
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = firstTest.action(async () => {
    globalThis.btoa = () => "first";
    entered();
    await gate;
    return atob("");
  });
  try {
    await ready;
    expect(
      await secondTest.action(async () => {
        globalThis.btoa = () => "second";
        return atob("");
      }),
    ).toBe("second");
    release();
    expect(await first).toBe("first");
  } finally {
    release();
    await first;
  }
});
