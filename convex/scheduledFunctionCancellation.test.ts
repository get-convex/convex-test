// @vitest-environment node

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const realSetTimeout = globalThis.setTimeout;

async function blockedScheduledFunction() {
  let notifyLoading!: () => void;
  const loading = new Promise<void>((resolve) => {
    notifyLoading = resolve;
  });
  const t = convexTest(schema, {
    ...modules,
    "./scheduler.ts": () => {
      notifyLoading();
      return new Promise<never>(() => {});
    },
  });
  await t.mutation(async (ctx) => {
    await ctx.scheduler.runAfter(0, api.scheduler.add, {
      body: "blocked module load",
      author: "AI",
    });
  });
  return { t, loading };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test("stops advancing timers when the original fake clock is replaced", async () => {
  const { t, loading } = await blockedScheduledFunction();
  const advanceTimers = vi.fn(vi.runAllTimers);
  const outcome = t
    .finishAllScheduledFunctions(advanceTimers)
    .catch((error) => error);
  await loading;
  const callsBeforeTeardown = advanceTimers.mock.calls.length;

  // A timed-out test restores its timers, then the next test installs a new clock.
  vi.useRealTimers();
  vi.useFakeTimers();
  const nextTestTimer = vi.fn();
  setTimeout(nextTestTimer, 60_000);

  await new Promise<void>((resolve) => realSetTimeout(resolve, 20));

  expect(nextTestTimer).not.toHaveBeenCalled();
  expect(advanceTimers).toHaveBeenCalledTimes(callsBeforeTeardown);
  expect(await outcome).toMatchObject({
    message: expect.stringContaining("timers were restored or replaced"),
  });
});

test("stops pumping when advanceTimers throws", async () => {
  const { t, loading } = await blockedScheduledFunction();
  const reason = new Error("cannot advance timers");
  let fail = false;
  const advanceTimers = vi.fn(() => {
    if (fail) throw reason;
    vi.runAllTimers();
  });
  const outcome = t
    .finishAllScheduledFunctions(advanceTimers)
    .catch((error) => error);
  await loading;
  fail = true;

  expect(await outcome).toBe(reason);
  const callsAfterFailure = advanceTimers.mock.calls.length;
  await new Promise<void>((resolve) => realSetTimeout(resolve, 20));
  expect(advanceTimers).toHaveBeenCalledTimes(callsAfterFailure);
});
