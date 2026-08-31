import { expect, test } from "vitest";
import { convexTest, TestConvex, TestConvexForDataModel } from "../index";
import schema from "./schema";
import type { SchemaDefinition, GenericSchema } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

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

test("withIdentity returns an accessor that can be narrowed again", () => {
  const t = convexTest(schema);
  const asSarah: TestConvexForDataModel<DataModel> = t.withIdentity({
    name: "Sarah",
  });
  const asMichal: TestConvexForDataModel<DataModel> = asSarah.withIdentity({
    name: "Michal",
  });
  void asMichal;
  expect(true).toBe(true);
});

test("withIdentity and withRequestMetadata can be called in either order", () => {
  const t = convexTest(schema);
  // Both orders produce an accessor, so neither method loses what the other
  // one configured.
  const identityFirst: TestConvexForDataModel<DataModel> = t
    .withIdentity({ name: "Sarah" })
    .withRequestMetadata({ ip: "1.2.3.4" });
  const requestFirst: TestConvexForDataModel<DataModel> = t
    .withRequestMetadata({ ip: "1.2.3.4" })
    .withIdentity({ name: "Sarah" });
  void identityFirst;
  void requestFirst;
  expect(true).toBe(true);
});

test("TestConvex with specific schema is assignable to generic TestConvex", () => {
  const t = convexTest(schema);
  // This is the call that fails with the overloaded call signature approach
  registerComponent(t);
  expect(true).toBe(true);
});
