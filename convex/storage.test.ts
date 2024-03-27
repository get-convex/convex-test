import { expect, test } from "vitest";
import { convexTest } from "../syscalls";
import { internal } from "./_generated/api";
import schema from "./schema";

test("action store blob", async () => {
  const t = convexTest(schema);
  const bytes = new Uint8Array([0b00001100, 0b00000000]).buffer;
  const storageId = await t.action(internal.storage.actionStoreBlob, { bytes });
  const result = await t.query(internal.storage.listFiles);
  expect(result).toMatchObject([
    {
      _id: storageId,
      sha256: "v2DkNJys5rzg1VLo14NCjbZtDWSb2eQwo2J+LuFKyDk=",
      size: 2,
    },
  ]);
});
