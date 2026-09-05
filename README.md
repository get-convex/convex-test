# `convex-test`

The `convex-test` library provides a community-maintained mock implementation of
the Convex backend in TypeScript, for use in automated tests of Convex
functions.

Check out the Convex testing docs: https://docs.convex.dev/functions/testing

## Define a test application

Use `defineTestApp` to define a small application for tests, such as a host
application for a component. It provides schema-bound function builders, typed
function references, and fresh `convexTest` instances without generated files or
an `import.meta.glob` for the application.

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { defineTestApp } from "convex-test";
import { expect, test } from "vitest";

const schema = defineSchema({
  events: defineTable({ key: v.string() }).index("key", ["key"]),
});
const app = defineTestApp({ schema });

const { api, internal, createTest } = app.defineModules({
  test: {
    bar: app.mutation({
      args: { key: v.string() },
      returns: v.id("events"),
      handler: async (ctx, args) => await ctx.db.insert("events", args),
    }),
    record: app.internalAction({
      args: { key: v.string() },
      returns: v.null(),
      handler: async (ctx, args): Promise<null> => {
        await ctx.runMutation(api.test.bar, args);
        return null;
      },
    }),
  },
});

test("records an event", async () => {
  const t = createTest();
  await t.action(internal.test.record, { key: "example" });
  const event = await t.query(async (ctx) =>
    ctx.db
      .query("events")
      .withIndex("key", (q) => q.eq("key", "example"))
      .unique(),
  );
  expect(event?.key).toBe("example");
});
```

The builders are `query`, `mutation`, `action`, `internalQuery`,
`internalMutation`, and `internalAction`. They use the same arguments, return
validators, and handlers as the corresponding generated Convex builders.
Handlers that reference the API being defined may need an explicit return type
annotation, as `record` does above, to break TypeScript inference cycles.

Module keys are paths without a leading `./` or file extension. For example,
`"test/callbacks"` produces references under `api.test.callbacks` or
`internal.test.callbacks`. Values are objects of module exports, including
already-registered functions. Public functions appear in `api`; internal
functions appear in `internal`. Other exports are omitted from the API types.
The references work with nested function calls, scheduling, and
`createFunctionHandle`, using the existing `convex-test` execution and validation
behavior.

Call `createTest()` inside each test for fresh database, scheduler, and component
registration state. It returns a normal `TestConvex<typeof schema>` that supports
component packages' existing default testing helpers:

```ts
import workpoolTest from "@convex-dev/workpool/test";

const t = createTest();
workpoolTest.register(t);
// Or register under a custom name:
workpoolTest.register(t, "anotherWorkpool");
```

You can also use `t.registerComponent(name, componentSchema, componentModules)`
directly. Component registration remains explicit; `defineTestApp` does not load
`convex.config.ts`. `withIdentity`, `run`, and the other test methods work as
usual. To enable transaction limits, pass the same settings supported by
`convexTest`, for example `createTest({ transactionLimits: true })`.
