/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * Generated by convex@1.10.0.
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as actions from "../actions.js";
import type * as argumentsValidation from "../argumentsValidation.js";
import type * as authentication from "../authentication.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as mutations from "../mutations.js";
import type * as pagination from "../pagination.js";
import type * as queries from "../queries.js";
import type * as scheduler from "../scheduler.js";
import type * as storage from "../storage.js";
import type * as textSearch from "../textSearch.js";
import type * as vectorSearch from "../vectorSearch.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  argumentsValidation: typeof argumentsValidation;
  authentication: typeof authentication;
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
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
