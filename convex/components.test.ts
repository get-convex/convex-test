/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import counterSchema from "../counter/component/schema";

test("generated attributes", async () => {
  const t = convexTest(schema);
  t.registerComponent(
    "counter",
    counterSchema,
    import.meta.glob("../counter/component/**/*.ts"),
  );
  const x = await t.mutation(internal.components.directCall);
  // const x = await t.query(internal.components.directCall2);
  expect(x).toEqual(3);
});
