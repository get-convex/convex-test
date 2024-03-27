import { expect, test, vi } from "vitest";
import { convexTest } from "../syscalls";
import { api, internal } from "./_generated/api";
import schema from "./schema";

test("mutation scheduling action", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  await t.mutation(api.scheduler.mutationSchedulingAction, {
    delayMs: 10000,
    body: "through scheduler",
  });
  {
    const jobs = await t.query(internal.scheduler.jobs);
    expect(jobs).toMatchObject([
      { state: { kind: "pending" }, args: [{ body: "through scheduler" }] },
    ]);
  }

  vi.advanceTimersByTime(5000);

  {
    const jobs = await t.query(internal.scheduler.jobs);
    expect(jobs).toMatchObject([{ state: { kind: "pending" } }]);
  }

  vi.runAllTimers();

  await t.finishInProgressScheduledFunctions();

  const result = await t.query(internal.scheduler.list);
  expect(result).toMatchObject([{ body: "through scheduler", author: "AI" }]);
  {
    const jobs = await t.query(internal.scheduler.jobs);
    expect(jobs).toMatchObject([{ state: { kind: "success" } }]);
  }
});

test("cancel", async () => {
  const t = convexTest(schema);
  const id = await t.mutation(api.scheduler.mutationSchedulingAction, {
    body: "through scheduler",
    delayMs: 10000,
  });
  await t.mutation(api.scheduler.cancel, { id });
  const jobs = await t.query(internal.scheduler.jobs);
  expect(jobs).toMatchObject([{ state: { kind: "canceled" } }]);

  vi.runAllTimers();
  await t.finishInProgressScheduledFunctions();

  const result = await t.query(internal.scheduler.list);
  expect(result).toMatchObject([]);
});
