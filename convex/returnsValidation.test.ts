import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

test("query with incomplete return validator should fail", async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "Alice", body: "Hello" });
  });

  await expect(
    t.query(api.returnsValidation.queryWithIncompleteReturnValidator),
  ).rejects.toThrowError(/Return value validation failed/);
});

test("query with correct return validator should pass", async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "Bob", body: "World" });
  });

  const result = await t.query(
    api.returnsValidation.queryWithCorrectReturnValidator,
  );
  expect(result).not.toBeNull();
  expect(result?.author).toBe("Bob");
  expect(result?._creationTime).toBeDefined();
});

test("query returning correct primitive type should pass", async () => {
  const t = convexTest(schema);
  const result = await t.query(api.returnsValidation.queryReturningNumber);
  expect(result).toBe(42);
});

test("query returning wrong primitive type should fail", async () => {
  const t = convexTest(schema);
  await expect(
    t.query(api.returnsValidation.queryReturningWrongType),
  ).rejects.toThrowError(/Return value validation failed/);
});

test("mutation with incomplete return validator should fail", async () => {
  const t = convexTest(schema);

  await expect(
    t.mutation(api.returnsValidation.mutationWithIncompleteReturnValidator, {
      author: "Charlie",
      body: "Test",
    }),
  ).rejects.toThrowError(/Return value validation failed/);
});

test("mutation with correct return validator should pass", async () => {
  const t = convexTest(schema);

  const result = await t.mutation(
    api.returnsValidation.mutationWithCorrectReturnValidator,
    { author: "Diana", body: "Test" },
  );
  expect(result).not.toBeNull();
  expect(result.author).toBe("Diana");
  expect(result._creationTime).toBeDefined();
});

test("query without return validator should pass", async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "Eve", body: "No validator" });
  });

  const result = await t.query(
    api.returnsValidation.queryWithoutReturnValidator,
  );
  expect(result).not.toBeNull();
});

test("query returning array with incomplete item validator should fail", async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await ctx.db.insert("messages", { author: "Frank", body: "Array test" });
  });

  await expect(
    t.query(api.returnsValidation.queryReturningArrayWithIncompleteValidator),
  ).rejects.toThrowError(/Return value validation failed/);
});

test("action with incomplete return validator should fail", async () => {
  const t = convexTest(schema);

  await expect(
    t.action(api.returnsValidation.actionWithIncompleteReturnValidator),
  ).rejects.toThrowError(/Return value validation failed/);
});

test("action with correct return validator should pass", async () => {
  const t = convexTest(schema);

  const result = await t.action(
    api.returnsValidation.actionWithCorrectReturnValidator,
  );
  expect(result).toEqual({ name: "test", value: 42 });
});
