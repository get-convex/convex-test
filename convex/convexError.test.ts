import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

test("ConvexError.data is deserialized when caught from runMutation in action", async () => {
  const t = convexTest(schema);
  let caught: unknown;
  await t.action(async (ctx) => {
    try {
      await ctx.runMutation(api.convexError.throwsObject, {});
    } catch (e) {
      caught = e;
    }
  });
  expect(caught).toBeInstanceOf(ConvexError);
  expect((caught as ConvexError<{ kind: string }>).data).toEqual({ kind: "x" });
});

test("ConvexError.data is deserialized when caught from runQuery in action", async () => {
  const t = convexTest(schema);
  let caught: unknown;
  await t.action(async (ctx) => {
    try {
      await ctx.runQuery(api.convexError.queryThrowsObject, {});
    } catch (e) {
      caught = e;
    }
  });
  expect(caught).toBeInstanceOf(ConvexError);
  expect((caught as ConvexError<{ kind: string }>).data).toEqual({ kind: "q" });
});

test("ConvexError.data is deserialized when caught from runAction in action", async () => {
  const t = convexTest(schema);
  let caught: unknown;
  await t.action(async (ctx) => {
    try {
      await ctx.runAction(api.convexError.actionThrowsObject, {});
    } catch (e) {
      caught = e;
    }
  });
  expect(caught).toBeInstanceOf(ConvexError);
  expect((caught as ConvexError<{ kind: string }>).data).toEqual({ kind: "a" });
});

test("ConvexError.data is deserialized at the test boundary", async () => {
  const t = convexTest(schema);
  await expect(
    t.mutation(api.convexError.throwsObject, {}),
  ).rejects.toMatchObject({ data: { kind: "x" } });
});

test("ConvexError.data is deserialized when caught from runMutation inside a mutation", async () => {
  const t = convexTest(schema);
  const caught = await t.mutation(
    api.convexError.mutationCatchingConvexError,
    {},
  );
  expect(caught).toEqual({ kind: "x" });
});

test("ConvexError with primitive data round-trips", async () => {
  const t = convexTest(schema);
  await expect(
    t.mutation(api.convexError.throwsString, {}),
  ).rejects.toMatchObject({ data: "just a message" });
});

test("ConvexError.data is deserialized from inline t.query handler", async () => {
  const t = convexTest(schema);
  await expect(
    t.query(async () => {
      throw new ConvexError({ kind: "inline-query" });
    }),
  ).rejects.toMatchObject({ data: { kind: "inline-query" } });
});

test("ConvexError.data is deserialized from inline t.mutation handler", async () => {
  const t = convexTest(schema);
  await expect(
    t.mutation(async () => {
      throw new ConvexError({ kind: "inline-mutation" });
    }),
  ).rejects.toMatchObject({ data: { kind: "inline-mutation" } });
});

test("ConvexError.data is deserialized from inline t.action handler", async () => {
  const t = convexTest(schema);
  await expect(
    t.action(async () => {
      throw new ConvexError({ kind: "inline-action" });
    }),
  ).rejects.toMatchObject({ data: { kind: "inline-action" } });
});

test("ConvexError.data is deserialized from t.run handler", async () => {
  const t = convexTest(schema);
  await expect(
    t.run(async () => {
      throw new ConvexError({ kind: "inline-run" });
    }),
  ).rejects.toMatchObject({ data: { kind: "inline-run" } });
});
