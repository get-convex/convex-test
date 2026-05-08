import { expect, test } from "vitest";
import { convexTest } from "../index";
import { api } from "./_generated/api";
import schema from "./schema";

test("log.audit no-ops", async () => {
  const t = convexTest(schema);
  const result = await t.query(api.auditLogging.loggedQuery);
  expect(result).toBe("ok");
});
