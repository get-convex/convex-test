import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";

// Keep this in its own file so no earlier test has installed the global proxies.
test("initializing convexTest preserves global property enumerability", () => {
  const before = Object.fromEntries(
    Object.entries(Object.getOwnPropertyDescriptors(globalThis)).map(
      ([key, descriptor]) => [key, descriptor.enumerable],
    ),
  );

  convexTest(schema);

  const after = Object.fromEntries(
    Object.keys(before).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key)?.enumerable,
    ]),
  );
  expect(after).toEqual(before);
});
