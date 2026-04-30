/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { api } from "./_generated/api";

const expected = {
  name: "test",
  region: null,
  class: "s16",
};

test("query", async () => {
  const t = convexTest({ schema });
  expect(await t.query(api.getDeploymentMetadata.metadataQuery)).toEqual(
    expected,
  );
});

test("mutation", async () => {
  const t = convexTest({ schema });
  expect(await t.mutation(api.getDeploymentMetadata.metadataMutation)).toEqual(
    expected,
  );
});

test("action", async () => {
  const t = convexTest({ schema });
  expect(await t.action(api.getDeploymentMetadata.metadataAction)).toEqual(
    expected,
  );
});
