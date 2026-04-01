import { expect, test, vi } from "vitest";
import { convexTest } from "../index";
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
  vi.useRealTimers();
});

test("mutation scheduling action then mutation fails", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  await t.mutation(api.scheduler.mutationSchedulingAction, {
    delayMs: 10000,
    body: "through scheduler",
  });
  vi.runAllTimers();
  await t.finishInProgressScheduledFunctions();
  {
    const jobs = await t.query(internal.scheduler.jobs);
    expect(jobs).toMatchObject([{ state: { kind: "success" } }]);
  }
  // An unrelated mutation throws an error.
  // This does not affect the scheduled functions which have already run and
  // committed.
  // This is a regression test: previously the error would cause the scheduled
  // function to go back to "inProgress".
  try {
    await t.mutation(api.scheduler.add, { body: "FAIL THIS", author: "AI" });
  } catch (e: any) {
    expect(e.message).toBe("failed as intended");
  }
  {
    const jobs = await t.query(internal.scheduler.jobs);
    expect(jobs).toMatchObject([{ state: { kind: "success" } }]);
  }
  vi.useRealTimers();
});

test("cancel mutation", async () => {
  vi.useFakeTimers();
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
  vi.useRealTimers();
});

test("action scheduling action", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  await t.action(api.scheduler.actionSchedulingAction, {
    delayMs: 0,
    body: "through scheduler",
  });
  {
    const jobs = await t.query(internal.scheduler.jobs);
    expect(jobs).toMatchObject([
      { state: { kind: "pending" }, args: [{ body: "through scheduler" }] },
    ]);
  }

  vi.runAllTimers();

  await t.finishInProgressScheduledFunctions();

  const result = await t.query(internal.scheduler.list);
  expect(result).toMatchObject([{ body: "through scheduler", author: "AI" }]);
  {
    const jobs = await t.query(internal.scheduler.jobs);
    expect(jobs).toMatchObject([{ state: { kind: "success" } }]);
  }
  vi.useRealTimers();
});

test("action scheduling action many times", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  await t.action(api.scheduler.actionSchedulingActionNTimes, {
    count: 10,
  });

  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const result = (await t.query(internal.scheduler.list)).at(-1);
  expect(result).toMatchObject({ body: "count 0", author: "AI" });

  vi.useRealTimers();
});

test("cancel action", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  const id = await t.action(api.scheduler.actionSchedulingAction, {
    body: "through scheduler",
    delayMs: 10000,
  });
  await t.action(api.scheduler.cancelAction, { id });
  const jobs = await t.query(internal.scheduler.jobs);
  expect(jobs).toMatchObject([{ state: { kind: "canceled" } }]);

  vi.runAllTimers();
  await t.finishInProgressScheduledFunctions();

  const result = await t.query(internal.scheduler.list);
  expect(result).toMatchObject([]);
  vi.useRealTimers();
});

test("failed scheduled function", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  await t.mutation(api.scheduler.mutationSchedulingAction, {
    delayMs: 0,
    body: "FAIL THIS",
  });
  vi.runAllTimers();
  await t.finishInProgressScheduledFunctions();
  // Regression test: previously this would throw an error that the scheduled
  // function state is "failed" while it should be "inProgress".
  const jobs = await t.query(internal.scheduler.jobs);
  expect(jobs).toMatchObject([
    { state: { kind: "failed" }, args: [{ body: "FAIL THIS" }] },
  ]);
  vi.useRealTimers();
});

test("self-scheduling mutation", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  await t.mutation(api.scheduler.selfSchedulingMutation, {});

  await expect(
    t.finishAllScheduledFunctions(vi.runAllTimers),
  ).rejects.toThrowError(/Check for infinitely recursive scheduled functions/);

  vi.useRealTimers();
});

test("scheduled action that uses setTimeout internally", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  await t.mutation(api.scheduler.mutationSchedulingActionWithTimeout, {
    body: "delayed action",
  });
  // The scheduled action uses setTimeout(resolve, 100) internally.
  // finishAllScheduledFunctions needs to pump timers while waiting for
  // the action to complete, otherwise it will hang.
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const result = await t.query(internal.scheduler.list);
  expect(result).toMatchObject([{ body: "delayed action", author: "AI" }]);
  vi.useRealTimers();
});

test("new convexTest after orphaned scheduled functions", async () => {
  // First test instance: schedule something and advance timers so the
  // setTimeout fires, but don't await finishInProgressScheduledFunctions.
  // This leaves an in-progress function orphaned.
  vi.useFakeTimers();
  const t1 = convexTest(schema);
  await t1.mutation(api.scheduler.mutationSchedulingAction, {
    body: "orphaned",
    delayMs: 0,
  });
  vi.runAllTimers();
  // Don't call finishInProgressScheduledFunctions — leave it orphaned
  vi.useRealTimers();

  // Second test instance: should clean up the orphaned function and not throw
  const t2 = convexTest(schema);
  // Verify it works normally
  await t2.mutation(api.scheduler.add, { body: "fresh", author: "test" });
  const result = await t2.query(internal.scheduler.list);
  expect(result).toMatchObject([{ body: "fresh", author: "test" }]);
});

test("finishInProgressScheduledFunctions runs only ready functions", async () => {
  // This tests that functions scheduled for the future don't run
  // when only immediate functions should execute.
  vi.useFakeTimers();
  const t = convexTest(schema);
  await t.mutation(api.scheduler.scheduleNowAndLater, {});

  // Only run ready functions (the immediate one), not future ones
  await t.finishInProgressScheduledFunctions();

  const result = await t.query(internal.scheduler.list);
  // Only the immediate function should have run
  expect(result).toMatchObject([{ body: "immediate" }]);

  const jobs = await t.query(internal.scheduler.jobs);
  const pending = jobs.filter(
    (j: { state: { kind: string } }) => j.state.kind === "pending",
  );
  const success = jobs.filter(
    (j: { state: { kind: string } }) => j.state.kind === "success",
  );
  expect(pending).toHaveLength(1); // the delayed one is still pending
  expect(success).toHaveLength(1); // the immediate one succeeded
  vi.useRealTimers();
});

test("scheduled functions don't fire during unrelated function execution", async () => {
  // On main, scheduled functions execute via setTimeout callbacks,
  // which can fire in the middle of other function executions.
  // With the explicit scheduler, functions only run when you call
  // finishInProgressScheduledFunctions or finishAllScheduledFunctions.
  vi.useFakeTimers();
  const t = convexTest(schema);

  // Schedule a function for delay=0
  await t.mutation(api.scheduler.mutationSchedulingAction, {
    body: "scheduled",
    delayMs: 0,
  });

  // Advance timers — on main this would trigger the scheduled function's
  // setTimeout callback. With explicit scheduler, nothing executes.
  vi.runAllTimers();

  // The scheduled function should still be pending (not automatically executed)
  // until we explicitly call finishInProgressScheduledFunctions
  const jobsBefore = await t.query(internal.scheduler.jobs);
  expect(jobsBefore).toMatchObject([{ state: { kind: "pending" } }]);

  // Now explicitly run it
  await t.finishInProgressScheduledFunctions();

  const jobsAfter = await t.query(internal.scheduler.jobs);
  expect(jobsAfter).toMatchObject([{ state: { kind: "success" } }]);
  vi.useRealTimers();
});

test("finishInProgressScheduledFunctions without prior vi.runAllTimers", async () => {
  // On main, finishInProgressScheduledFunctions only waits for already
  // in-progress functions — it doesn't find and execute pending ones.
  // With the explicit scheduler, it also runs pending functions whose
  // scheduledTime <= Date.now(), so no vi.runAllTimers() is needed
  // for delay=0 scheduled functions.
  vi.useFakeTimers();
  const t = convexTest(schema);
  await t.mutation(api.scheduler.mutationSchedulingAction, {
    body: "no timers needed",
    delayMs: 0,
  });

  // Don't call vi.runAllTimers() — just call finishInProgressScheduledFunctions
  await t.finishInProgressScheduledFunctions();

  const result = await t.query(internal.scheduler.list);
  expect(result).toMatchObject([{ body: "no timers needed", author: "AI" }]);
  const jobs = await t.query(internal.scheduler.jobs);
  expect(jobs).toMatchObject([{ state: { kind: "success" } }]);
  vi.useRealTimers();
});

test("argument serialization", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  await t.mutation(api.scheduler.mutationSchedulingAction, {
    delayMs: 10000,
    body: "through scheduler",
    bigint: BigInt(1),
  });
  {
    const jobs = await t.query(internal.scheduler.jobs);
    expect(jobs).toMatchObject([
      {
        state: { kind: "pending" },
        args: [{ body: "through scheduler", bigint: BigInt(1) }],
      },
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
  vi.useRealTimers();
});
