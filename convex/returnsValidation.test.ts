import { expect, test, describe } from "vitest";
import { convexTest } from "../index";
import { makeFunctionReference } from "convex/server";
import schema from "./schema";

// Helper to create function references without needing generated api types
const api = {
  returnsValidation: {
    queryWithIncompleteReturnValidator: makeFunctionReference<"query">(
      "returnsValidation:queryWithIncompleteReturnValidator",
    ),
    queryWithCorrectReturnValidator: makeFunctionReference<"query">(
      "returnsValidation:queryWithCorrectReturnValidator",
    ),
    queryReturningNumber: makeFunctionReference<"query">(
      "returnsValidation:queryReturningNumber",
    ),
    queryReturningWrongType: makeFunctionReference<"query">(
      "returnsValidation:queryReturningWrongType",
    ),
    mutationWithIncompleteReturnValidator: makeFunctionReference<"mutation">(
      "returnsValidation:mutationWithIncompleteReturnValidator",
    ),
    mutationWithCorrectReturnValidator: makeFunctionReference<"mutation">(
      "returnsValidation:mutationWithCorrectReturnValidator",
    ),
    queryWithoutReturnValidator: makeFunctionReference<"query">(
      "returnsValidation:queryWithoutReturnValidator",
    ),
    queryReturningArrayWithIncompleteValidator: makeFunctionReference<"query">(
      "returnsValidation:queryReturningArrayWithIncompleteValidator",
    ),
    actionWithIncompleteReturnValidator: makeFunctionReference<"action">(
      "returnsValidation:actionWithIncompleteReturnValidator",
    ),
    actionWithCorrectReturnValidator: makeFunctionReference<"action">(
      "returnsValidation:actionWithCorrectReturnValidator",
    ),
  },
};

describe("return value validation", () => {
  test("query with incomplete return validator should fail", async () => {
    const t = convexTest(schema);

    // Insert a message so the query returns something
    await t.run(async (ctx) => {
      await ctx.db.insert("messages", { author: "Alice", body: "Hello" });
    });

    // This query has a return validator that's missing _creationTime
    // The real Convex runtime would throw ReturnsValidationError
    // convex-test should also throw an error here
    await expect(
      t.query(api.returnsValidation.queryWithIncompleteReturnValidator, {}),
    ).rejects.toThrowError(/Validator error|extra field/i);
  });

  test("query with correct return validator should pass", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("messages", { author: "Bob", body: "World" });
    });

    // This query has a complete return validator including _creationTime
    const result = await t.query(
      api.returnsValidation.queryWithCorrectReturnValidator,
      {},
    );
    expect(result).not.toBeNull();
    expect(result?.author).toBe("Bob");
    expect(result?._creationTime).toBeDefined();
  });

  test("query returning correct primitive type should pass", async () => {
    const t = convexTest(schema);
    const result = await t.query(
      api.returnsValidation.queryReturningNumber,
      {},
    );
    expect(result).toBe(42);
  });

  test("query returning wrong primitive type should fail", async () => {
    const t = convexTest(schema);
    // Handler returns number but validator expects string
    await expect(
      t.query(api.returnsValidation.queryReturningWrongType, {}),
    ).rejects.toThrowError(/Validator error/i);
  });

  test("mutation with incomplete return validator should fail", async () => {
    const t = convexTest(schema);

    // This mutation returns a document but validator is missing _creationTime
    await expect(
      t.mutation(api.returnsValidation.mutationWithIncompleteReturnValidator, {
        author: "Charlie",
        body: "Test",
      }),
    ).rejects.toThrowError(/Validator error|extra field/i);
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

  test("query without return validator should pass (no validation)", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("messages", { author: "Eve", body: "No validator" });
    });

    // No return validator = no validation = should work
    const result = await t.query(
      api.returnsValidation.queryWithoutReturnValidator,
      {},
    );
    expect(result).not.toBeNull();
  });

  test("query returning array with incomplete item validator should fail", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("messages", { author: "Frank", body: "Array test" });
    });

    // Array items are missing _creationTime in validator
    await expect(
      t.query(
        api.returnsValidation.queryReturningArrayWithIncompleteValidator,
        {},
      ),
    ).rejects.toThrowError(/Validator error|extra field/i);
  });

  test("action with incomplete return validator should fail", async () => {
    const t = convexTest(schema);

    // This action returns an object with extraField but validator doesn't expect it
    await expect(
      t.action(api.returnsValidation.actionWithIncompleteReturnValidator, {}),
    ).rejects.toThrowError(/Validator error|extra field/i);
  });

  test("action with correct return validator should pass", async () => {
    const t = convexTest(schema);

    const result = await t.action(
      api.returnsValidation.actionWithCorrectReturnValidator,
      {},
    );
    expect(result).toEqual({ name: "test", value: 42 });
  });
});
