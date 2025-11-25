/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    public: {
      add: FunctionReference<
        "mutation",
        "internal",
        { count: number; name: string; shards?: number },
        null,
        Name
      >;
      count: FunctionReference<
        "query",
        "internal",
        { name: string },
        number,
        Name
      >;
      countMany: FunctionReference<
        "action",
        "internal",
        { names: Array<string> },
        Array<number>,
        Name
      >;
      mutationWithNestedQuery: FunctionReference<
        "mutation",
        "internal",
        {},
        any,
        Name
      >;
      mutationWithNumberArg: FunctionReference<
        "mutation",
        "internal",
        { a: number },
        any,
        Name
      >;
      schedule: FunctionReference<
        "mutation",
        "internal",
        { name: string },
        any,
        Name
      >;
    };
  };
