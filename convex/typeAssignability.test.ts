import { expect, test } from "vitest";
import { convexTest, TestConvex } from "../index";
import schema from "./schema";
import type { SchemaDefinition, GenericSchema } from "convex/server";

// Reproduction: a library function that accepts a generic TestConvex
// (like workflow.register does)
function registerComponent(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name: string = "myComponent",
) {
  // Library code that doesn't know the caller's schema
  void t;
  void name;
}

test("withIdentity returns a full accessor", () => {
  const t = convexTest(schema);
  const asSarah: TestConvex<typeof schema> = t.withIdentity({ name: "Sarah" });
  // Anything that can be done with the original accessor can be done with the
  // narrowed one, including narrowing it further.
  registerComponent(asSarah.withIdentity({ name: "Michal" }));
  expect(true).toBe(true);
});

test("TestConvex with specific schema is assignable to generic TestConvex", () => {
  const t = convexTest(schema);
  // This is the call that fails with the overloaded call signature approach
  registerComponent(t);
  expect(true).toBe(true);
});
