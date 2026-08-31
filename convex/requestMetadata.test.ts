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
  const t = convexTest(schema);
  const response = await t.fetch("/requestMetadata");
  const { own, nested } = await response.json();
  expect(own).toEqual(defaultMetadata);
  expect(nested).toEqual(own);
});

test("scheduled mutation", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema);
  const caller = await t.mutation(api.requestMetadata.scheduleMutation);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();

  const recorded = await t.query(api.requestMetadata.recorded);
  expect(recorded.map(({ label }) => label)).toEqual([
    "scheduledMutation",
    "nestedInScheduledMutation",
  ]);
  const [scheduled, nested] = recorded.map(({ metadata }) => metadata);
  // The scheduled function is its own request, not the caller's.
  expect(scheduled.requestId).not.toEqual(caller.requestId);
  expect(scheduled.requestId).toEqual(expect.stringMatching(UUID));
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
