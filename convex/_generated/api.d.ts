/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions from "../actions.js";
import type * as argumentsValidation from "../argumentsValidation.js";
import type * as authentication from "../authentication.js";
import type * as component from "../component.js";
import type * as explicitTableNames from "../explicitTableNames.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as mutations from "../mutations.js";
import type * as pagination from "../pagination.js";
import type * as queries from "../queries.js";
import type * as scheduler from "../scheduler.js";
import type * as storage from "../storage.js";
import type * as textSearch from "../textSearch.js";
import type * as vectorSearch from "../vectorSearch.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  argumentsValidation: typeof argumentsValidation;
  authentication: typeof authentication;
  component: typeof component;
  explicitTableNames: typeof explicitTableNames;
  http: typeof http;
  messages: typeof messages;
  mutations: typeof mutations;
  pagination: typeof pagination;
  queries: typeof queries;
  scheduler: typeof scheduler;
  storage: typeof storage;
  textSearch: typeof textSearch;
  vectorSearch: typeof vectorSearch;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  counter: {
    public: {
      add: FunctionReference<
        "mutation",
        "internal",
        { count: number; name: string; shards?: number },
        null
      >;
      count: FunctionReference<"query", "internal", { name: string }, number>;
      countMany: FunctionReference<
        "action",
        "internal",
        { names: Array<string> },
        Array<number>
      >;
      mutationWithNestedQuery: FunctionReference<
        "mutation",
        "internal",
        {},
        any
      >;
      mutationWithNumberArg: FunctionReference<
        "mutation",
        "internal",
        { a: number },
        any
      >;
      schedule: FunctionReference<
        "mutation",
        "internal",
        { name: string },
        any
      >;
    };
  };
};
