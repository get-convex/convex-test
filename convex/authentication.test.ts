import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";

test("generated attributes", async () => {
  const t = convexTest(schema);
  const asSarah = t.withIdentity({ name: "Sarah" });
  const attributes = await asSarah.run((ctx) => {
    return ctx.auth.getUserIdentity();
  });
  expect(attributes).toMatchObject({ name: "Sarah" });
  expect(attributes!.tokenIdentifier).toBeTypeOf("string");
  expect(attributes!.subject).toBeTypeOf("string");
  expect(attributes!.issuer).toBeTypeOf("string");
});
