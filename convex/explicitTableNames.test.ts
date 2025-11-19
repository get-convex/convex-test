import { describe, test, expect } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { api } from "./_generated/api";

test("correctUsage should not throw", async () => {
  const t = convexTest(schema);
  await t.mutation(api.explicitTableNames.correctUsage);
});

describe("called with wrong table name", () => {
  test("get", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(api.explicitTableNames.getWrongTable),
    ).rejects.toThrowError(
      "Invalid argument `id`, expected ID in table 'otherTable' but got ID in table 'messages'",
    );
  });

  test("patch", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(api.explicitTableNames.patchWrongTable),
    ).rejects.toThrowError(
      "Invalid argument `id`, expected ID in table 'otherTable' but got ID in table 'messages'",
    );
  });

  test("delete", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(api.explicitTableNames.deleteWrongTable),
    ).rejects.toThrowError(
      "Invalid argument `id`, expected ID in table 'otherTable' but got ID in table 'messages'",
    );
  });

  test("replace", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(api.explicitTableNames.replaceWrongTable),
    ).rejects.toThrowError(
      "Invalid argument `id`, expected ID in table 'otherTable' but got ID in table 'messages'",
    );
  });
});
