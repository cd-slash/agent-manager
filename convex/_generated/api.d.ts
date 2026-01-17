/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as acceptanceCriteria from "../acceptanceCriteria.js";
import type * as chat from "../chat.js";
import type * as containers from "../containers.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as internal_aiResponses from "../internal/aiResponses.js";
import type * as internal_history from "../internal/history.js";
import type * as internal_metrics from "../internal/metrics.js";
import type * as internal_webhookProcessing from "../internal/webhookProcessing.js";
import type * as projects from "../projects.js";
import type * as pullRequests from "../pullRequests.js";
import type * as servers from "../servers.js";
import type * as tasks from "../tasks.js";
import type * as tests from "../tests.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  acceptanceCriteria: typeof acceptanceCriteria;
  chat: typeof chat;
  containers: typeof containers;
  crons: typeof crons;
  http: typeof http;
  "internal/aiResponses": typeof internal_aiResponses;
  "internal/history": typeof internal_history;
  "internal/metrics": typeof internal_metrics;
  "internal/webhookProcessing": typeof internal_webhookProcessing;
  projects: typeof projects;
  pullRequests: typeof pullRequests;
  servers: typeof servers;
  tasks: typeof tasks;
  tests: typeof tests;
  webhooks: typeof webhooks;
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

export declare const components: {};
