// @vitest-environment node

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "../index";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

// Capture Node's setImmediate before fake timers replace it.
const realSetImmediate = globalThis.setImmediate;

// Wait for real event-loop turns, independently of fake timer advancement.
async function afterEventLoopTurns(turns: number): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await new Promise<void>((resolve) => realSetImmediate(resolve));
  }
}

// Delay scheduler module loads once slow mode is enabled.
function modulesWithSlowSchedulerLoad(turns: number) {
  const control = { slow: false };
  const loadScheduler = modules["./scheduler.ts"];
  return {
    control,
    modules: {
      ...modules,
      "./scheduler.ts": async () => {
        if (control.slow) {
          await afterEventLoopTurns(turns);
        }
        return await loadScheduler();
      },
    },
  };
}

// The scheduled action and its mutation each load the scheduler module.
async function scheduleOneMessage(
  t: ReturnType<typeof convexTest>,
  control: { slow: boolean },
) {
  await t.mutation(api.scheduler.mutationSchedulingAction, {
    body: "through a slow module load",
    delayMs: 0,
  });
  control.slow = true;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test("finishes scheduled functions with slow module loads", async () => {
  const { control, modules } = modulesWithSlowSchedulerLoad(12_000);
  const t = convexTest(schema, modules);
  await scheduleOneMessage(t, control);

  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(await t.query(internal.scheduler.list)).toMatchObject([
    { body: "through a slow module load", author: "AI" },
  ]);
});
