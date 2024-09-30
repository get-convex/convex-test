/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { internal } from "./_generated/api";
import counterSchema from "../counter/component/schema";

const counterModules = import.meta.glob("../counter/component/**/*.ts");

test("generated attributes", async () => {
  const t = convexTest(schema);
  t.registerComponent(
    "counter",
    counterSchema,
    counterModules
  );
  const x = await t.mutation(internal.components.directCall);
  // const x = await t.query(internal.components.directCall2);
  expect(x).toEqual(3);
});

test("component scheduler", async () => {
  const t = convexTest(schema);
  t.registerComponent(
    "counter",
    counterSchema,
    counterModules
  );
  await t.mutation(internal.components.schedule);
});
