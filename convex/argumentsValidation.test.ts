import { expect, test } from "vitest";
import { convexTest } from "../syscalls";
import { api } from "./_generated/api";
import schema from "./schema";

test("query arguments validation", async () => {
  const t = convexTest(schema);
  await expect(
    async () =>
      await t.query(api.argumentsValidation.queryWithArgs, { a: "bad" as any })
  ).rejects.toThrowError(/Validator error/);
  await t.query(api.argumentsValidation.queryWithoutArgs, { a: "ok" } as any);
});

test("mutation arguments validation", async () => {
  const t = convexTest(schema);
  await expect(
    async () =>
      await t.mutation(api.argumentsValidation.mutationWithArgs, {
        a: 42,
        bad: 1,
      } as any)
  ).rejects.toThrowError(/Validator error/);
  await t.mutation(api.argumentsValidation.mutationWithoutArgs, {
    a: "ok",
  } as any);
});

test("action arguments validation", async () => {
  const t = convexTest(schema);
  await expect(
    async () =>
      await t.action(api.argumentsValidation.actionWithArgs, {} as any)
  ).rejects.toThrowError(/Validator error/);
  await t.action(api.argumentsValidation.actionWithoutArgs, { a: "ok" } as any);
});
