/// <reference types="vite/client" />

import { expect, test, vi } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { components, internal } from "./_generated/api";
import counterSchema from "../counter/component/schema";

const counterModules = import.meta.glob("../counter/component/**/*.ts");

function testWithCounter() {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);
  return t;
}

test("direct call", async () => {
  const t = testWithCounter();
  await t.mutation(components.counter.public.add, {
    name: "beans",
    count: 3,
  });
  const count = await t.query(components.counter.public.count, {
    name: "beans",
  });
  expect(count).toEqual(3);
  const counts = await t.action(components.counter.public.countMany, {
    names: ["beans", "pennies"],
  });
  expect(counts).toEqual([3, 0]);
});

test("calling with t.run", async () => {
  const t = testWithCounter();
  await t.run(async (ctx) => {
    await ctx.runMutation(components.counter.public.add, {
      name: "beans",
      count: 3,
    });
    const count = await ctx.runQuery(components.counter.public.count, {
      name: "beans",
    });
    expect(count).toEqual(3);
    const counts = await ctx.runAction(components.counter.public.countMany, {
      names: ["beans", "pennies"],
    });
    expect(counts).toEqual([3, 0]);
  });
});

test("generated attributes", async () => {
  const t = testWithCounter();
  const x = await t.action(internal.component.directCall);
  // const x = await t.query(internal.components.directCall2);
  expect(x).toEqual(3);
});

test("component scheduler", async () => {
  vi.useFakeTimers();
  const t = testWithCounter();
  await t.mutation(internal.component.schedule);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
});

test("function handle", async () => {
  const t = testWithCounter();
  const handle = await t.query(internal.component.getFunctionHandle);
  await t.mutation(internal.component.callHandle, { handle });
  const x = await t.query(internal.component.directCall2);
  expect(x).toEqual(3);
});

test("function handle scheduler", async () => {
  vi.useFakeTimers();
  const t = testWithCounter();
  const handle = await t.query(internal.component.getFunctionHandle);
  await t.mutation(internal.component.scheduleHandle, { handle });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const x = await t.query(internal.component.directCall2);
  expect(x).toEqual(3);
  vi.useRealTimers();
});

test("component nested query", async () => {
  const t = testWithCounter();
  const x = await t.mutation(internal.component.mutationWithNestedQuery);
  expect(x).toEqual(3);
});
