import { expect, test, vi } from "vitest";
import { convexTest } from "../syscalls";
import { api, internal } from "./_generated/api";
import schema from "./schema";

test("mutation scheduling action", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  await t.mutation(api.scheduler.mutationSchedulingAction, {
    body: "through scheduler",
  });
  {
    const jobs = await t.run(async (ctx) => {
      return await ctx.db.system.query("_scheduled_functions").collect();
    });
    expect(jobs.length).toEqual(1);
    expect(jobs[0].state.kind).toEqual("pending");
    expect(jobs[0].args[0].body).toEqual("through scheduler");
  }

  vi.runAllTimers();
  await t.finishInProgressScheduledFunctions();

  const result = await t.query(internal.scheduler.list);
  expect(result.length).toEqual(1);
  expect(result[0].body).toEqual("through scheduler");
  expect(result[0].author).toEqual("AI");
  {
    const jobs = await t.run(async (ctx) => {
      return await ctx.db.system.query("_scheduled_functions").collect();
    });
    expect(jobs.length).toEqual(1);
    expect(jobs[0].state.kind).toEqual("success");
  }
});
