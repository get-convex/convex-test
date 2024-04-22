import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";

test("crypto", async () => {
  const t = convexTest(schema);
  const result = await t.run(async () => {
    return crypto.randomUUID();
  });
  expect(result).toBeTypeOf("string");
});
