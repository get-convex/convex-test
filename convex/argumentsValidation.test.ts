import { anyApi } from "convex/server";
import { v } from "convex/values";
import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import schema from "./schema";
import counterSchema from "./counter/component/schema";

const counterModules = import.meta.glob("./counter/component/**/*.ts");

test("query arguments validation", async () => {
  const t = convexTest(schema);
  await expect(
    async () =>
      await t.query(api.argumentsValidation.queryWithArgs, { a: "bad" as any }),
  ).rejects.toThrowError("Validator error");
  await t.query(api.argumentsValidation.queryWithoutArgs, { a: "ok" } as any);
});

test("mutation arguments validation", async () => {
  const t = convexTest(schema);
  await expect(
    async () =>
      await t.mutation(api.argumentsValidation.mutationWithArgs, {
        a: 42,
        bad: 1,
      } as any),
  ).rejects.toThrowError("Validator error");
  await t.mutation(api.argumentsValidation.mutationWithoutArgs, {
    a: "ok",
  } as any);
});

test("action arguments validation", async () => {
  const t = convexTest(schema);
  await expect(
    async () =>
      await t.action(api.argumentsValidation.actionWithArgs, {} as any),
  ).rejects.toThrowError("Validator error");
  await t.action(api.argumentsValidation.actionWithoutArgs, { a: "ok" } as any);
});

test("optional fields", async () => {
  const t = convexTest(schema);
  const result = await t.query(
    api.argumentsValidation.queryWithOptionalArgs,
    {},
  );
  expect(result).toEqual("ok");
});

function testWithCounter() {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);
  return t;
}

test("component mutation arguments validation", async () => {
  const t = testWithCounter();
  expect(
    await t.mutation(api.argumentsValidation.componentMutationWithNumberArg, {
      a: 42,
    }),
  ).toEqual(42);
  await expect(
    t.mutation(api.argumentsValidation.componentMutationWithNumberArg, {
      a: "bad" as any,
    }),
  ).rejects.toThrowError(/Validator error/);
  expect(
    await t.mutation(api.argumentsValidation.componentMutationWithNumberArg, {
      a: Number.POSITIVE_INFINITY,
    }),
  ).toEqual(Number.POSITIVE_INFINITY);
});

// The real backend only accepts an object or `v.any()` as the args validator,
// and rejects anything else at push time. These functions can't live in
// `convex/` because they'd break `npx convex dev`, so they're defined inline.
function testWithBadArgsValidators() {
  return convexTest({
    schema,
    modules: {
      "./_generated/server.ts": () => Promise.resolve({}),
      "./badArgs.ts": () =>
        Promise.resolve({
          unionQuery: query({
            args: v.union(
              v.object({ a: v.number() }),
              v.object({ b: v.number() }),
            ),
            /* v8 ignore next */
            handler: () => "ok",
          }),
          unionMutation: mutation({
            args: v.union(
              v.object({ a: v.number() }),
              v.object({ b: v.number() }),
            ),
            /* v8 ignore next */
            handler: () => "ok",
          }),
          unionAction: action({
            args: v.union(
              v.object({ a: v.number() }),
              v.object({ b: v.number() }),
            ),
            /* v8 ignore next */
            handler: () => "ok",
          }),
          recordQuery: query({
            args: v.record(v.string(), v.number()),
            /* v8 ignore next */
            handler: () => "ok",
          }),
        }),
    },
  });
}

test("args validator must be an object or any", async () => {
  const t = testWithBadArgsValidators();
  const message =
    "Invalid JSON returned from badArgs.js:unionQuery.exportArgs(): " +
    "Args validator must be an object or any";
  await expect(
    t.query(anyApi.badArgs.unionQuery, { a: 1 }),
  ).rejects.toThrowError(message);
  await expect(
    t.mutation(anyApi.badArgs.unionMutation, { a: 1 }),
  ).rejects.toThrowError(/Args validator must be an object or any/);
  await expect(
    t.action(anyApi.badArgs.unionAction, { a: 1 }),
  ).rejects.toThrowError(/Args validator must be an object or any/);
  await expect(
    t.query(anyApi.badArgs.recordQuery, { a: 1 }),
  ).rejects.toThrowError(/Args validator must be an object or any/);
});

test("object and any args validators are allowed", async () => {
  const t = convexTest(schema);
  expect(
    await t.query(api.argumentsValidation.queryWithObjectValidatorArgs, {
      a: 1,
    }),
  ).toEqual("ok");
  await expect(
    t.query(api.argumentsValidation.queryWithObjectValidatorArgs, {
      a: "bad" as any,
    }),
  ).rejects.toThrowError(/Validator error/);
  expect(
    await t.query(api.argumentsValidation.queryWithAnyArgs, {
      anything: true,
    } as any),
  ).toEqual("ok");
});

test("query with union arg", async () => {
  const t = testWithCounter();
  expect(
    await t.query(api.argumentsValidation.queryWithUnionArg, {
      a: 42,
    }),
  ).toEqual("ok");
  expect(
    await t.query(api.argumentsValidation.queryWithUnionArg, {
      a: "42",
    }),
  ).toEqual("ok");
  await expect(
    t.query(api.argumentsValidation.queryWithUnionArg, {
      a: null as any,
    }),
  ).rejects.toThrowError(/Validator error/);
});
