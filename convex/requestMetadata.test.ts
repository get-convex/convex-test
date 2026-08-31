/// <reference types="vite/client" />

import { expect, test, vi } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { api } from "./_generated/api";
import counterSchema from "./counter/component/schema";

const counterModules = import.meta.glob("./counter/component/**/*.ts");

function testWithCounter() {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);
  return t;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const defaultMetadata = {
  ip: null,
  userAgent: null,
  requestId: expect.stringMatching(UUID),
  scheduledFunctionId: null,
  authToken: null,
};

test("default metadata in a mutation", async () => {
  const t = convexTest(schema);
  expect(await t.mutation(api.requestMetadata.metadataMutation)).toEqual(
    defaultMetadata,
  );
});

test("default metadata in an action", async () => {
  const t = convexTest(schema);
  expect(await t.action(api.requestMetadata.metadataAction)).toEqual(
    defaultMetadata,
  );
});

test("default metadata in inline functions", async () => {
  const t = convexTest(schema);
  expect(
    await t.mutation(async (ctx) => await ctx.meta.getRequestMetadata()),
  ).toEqual(defaultMetadata);
  expect(
    await t.action(async (ctx) => await ctx.meta.getRequestMetadata()),
  ).toEqual(defaultMetadata);
  expect(
    await t.run(async (ctx) => await ctx.meta.getRequestMetadata()),
  ).toEqual(defaultMetadata);
});

test("not available in queries", async () => {
  const t = convexTest(schema);
  await expect(t.query(api.requestMetadata.metadataQuery)).rejects.toThrow(
    "not available in queries",
  );
});

test("IP and user agent", async () => {
  const t = convexTest(schema).withRequestMetadata({
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
  });
  expect(await t.mutation(api.requestMetadata.metadataMutation)).toEqual({
    ...defaultMetadata,
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
  });
  expect(await t.action(api.requestMetadata.metadataAction)).toEqual({
    ...defaultMetadata,
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
  });
});

test("omitted request attributes are null", async () => {
  const t = convexTest(schema).withRequestMetadata({ ip: "1.2.3.4" });
  expect(await t.mutation(api.requestMetadata.metadataMutation)).toEqual({
    ...defaultMetadata,
    ip: "1.2.3.4",
  });
  // Calling the method again replaces both attributes.
  const t2 = t.withRequestMetadata({ userAgent: "Mozilla/5.0" });
  expect(await t2.mutation(api.requestMetadata.metadataMutation)).toEqual({
    ...defaultMetadata,
    userAgent: "Mozilla/5.0",
  });
});

test("the accessor it was called on is not affected", async () => {
  const t = convexTest(schema);
  const withMetadata = t.withRequestMetadata({ ip: "1.2.3.4" });
  expect(
    await withMetadata.mutation(api.requestMetadata.metadataMutation),
  ).toMatchObject({ ip: "1.2.3.4" });
  expect(await t.mutation(api.requestMetadata.metadataMutation)).toMatchObject({
    ip: null,
  });
});

test("accessors with different metadata used in parallel", async () => {
  const t = convexTest(schema);
  const [first, second] = await Promise.all([
    t
      .withRequestMetadata({ ip: "1.2.3.4" })
      .mutation(api.requestMetadata.metadataMutation),
    t
      .withRequestMetadata({ ip: "5.6.7.8", userAgent: "Firefox" })
      .mutation(api.requestMetadata.metadataMutation),
  ]);
  expect(first).toMatchObject({ ip: "1.2.3.4", userAgent: null });
  expect(second).toMatchObject({ ip: "5.6.7.8", userAgent: "Firefox" });
});

test("the IP and user agent propagate to nested calls", async () => {
  const t = testWithCounter().withRequestMetadata({
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
  });
  const { own, component } = await t.mutation(
    api.requestMetadata.mutationCallingMutation,
  );
  expect(own).toMatchObject({ ip: "1.2.3.4", userAgent: "Mozilla/5.0" });
  expect(component).toEqual(own);
  const recorded = await t.query(api.requestMetadata.recorded);
  expect(recorded[0].metadata).toEqual(own);
});

test("each top-level call gets its own request ID", async () => {
  const t = convexTest(schema);
  const first = await t.mutation(api.requestMetadata.metadataMutation);
  const second = await t.mutation(api.requestMetadata.metadataMutation);
  const third = await t.action(api.requestMetadata.metadataAction);
  expect(new Set([first, second, third].map((m) => m.requestId)).size).toEqual(
    3,
  );
});

test("nested calls share the request metadata", async () => {
  const t = testWithCounter();
  const { own, component } = await t.mutation(
    api.requestMetadata.mutationCallingMutation,
  );
  const recorded = await t.query(api.requestMetadata.recorded);
  expect(recorded.map(({ label }) => label)).toEqual(["nested"]);
  expect(recorded[0].metadata).toEqual(own);
  // Request metadata propagates into components, unlike the identity.
  expect(component).toEqual(own);
});

test("nested calls from an action share the request metadata", async () => {
  const t = testWithCounter();
  const { own, component } = await t.action(
    api.requestMetadata.actionCallingFunctions,
  );
  const recorded = await t.query(api.requestMetadata.recorded);
  expect(recorded.map(({ label }) => label)).toEqual([
    "mutationFromAction",
    "actionFromAction",
  ]);
  for (const { metadata } of recorded) {
    expect(metadata).toEqual(own);
  }
  expect(component).toEqual(own);
});

test("Node action", async () => {
  const t = convexTest(schema);
  const metadata = await t.action(api.requestMetadataNode.metadataAction);
  expect(metadata).toEqual(defaultMetadata);
  const recorded = await t.query(api.requestMetadata.recorded);
  expect(recorded[0].metadata).toEqual(metadata);
});

test("HTTP action", async () => {
  const t = convexTest(schema).withRequestMetadata({
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
  });
  const response = await t.fetch("/requestMetadata");
  const { own, nested } = await response.json();
  expect(own).toEqual({
    ...defaultMetadata,
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
  });
  expect(nested).toEqual(own);
});

test("HTTP request headers do not set the request metadata", async () => {
  const t = convexTest(schema);
  const response = await t.fetch("/requestMetadata", {
    headers: {
      "X-Forwarded-For": "1.2.3.4",
      "User-Agent": "Mozilla/5.0",
    },
  });
  const { own } = await response.json();
  expect(own).toMatchObject({ ip: null, userAgent: null });
});

test("scheduled mutation", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  const caller = await t
    .withRequestMetadata({ ip: "1.2.3.4", userAgent: "Mozilla/5.0" })
    .mutation(api.requestMetadata.scheduleMutation);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();

  const recorded = await t.query(api.requestMetadata.recorded);
  expect(recorded.map(({ label }) => label)).toEqual([
    "scheduledMutation",
    "nestedInScheduledMutation",
  ]);
  const [scheduled, nested] = recorded.map(({ metadata }) => metadata);
  // The scheduled function is its own request: none of the caller's data
  // reaches it.
  expect(scheduled).toEqual({
    ip: null,
    userAgent: null,
    requestId: expect.stringMatching(UUID),
    scheduledFunctionId: expect.any(String),
    authToken: null,
  });
  expect(scheduled.requestId).not.toEqual(caller.requestId);
  const jobs = await t.run(async (ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(scheduled.scheduledFunctionId).toEqual(jobs[0]._id);
  // The functions the scheduled function calls belong to the same request.
  expect(nested).toEqual(scheduled);
});

test("scheduled action scheduling another function", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  await t.mutation(api.requestMetadata.scheduleAction);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();

  const recorded = await t.query(api.requestMetadata.recorded);
  expect(recorded.map(({ label }) => label)).toEqual([
    "nestedInScheduledAction",
    "scheduledMutation",
    "nestedInScheduledMutation",
  ]);
  const [fromAction, scheduled, nestedInScheduled] = recorded.map(
    ({ metadata }) => metadata,
  );
  // The function scheduled by the scheduled action is its own request.
  expect(scheduled.requestId).not.toEqual(fromAction.requestId);
  expect(scheduled.scheduledFunctionId).not.toEqual(
    fromAction.scheduledFunctionId,
  );
  expect(nestedInScheduled).toEqual(scheduled);
});

test("functions that were not scheduled have no scheduled function ID", async () => {
  const t = convexTest(schema);
  const metadata = await t.mutation(api.requestMetadata.metadataMutation);
  expect(metadata.scheduledFunctionId).toEqual(null);
});
