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
import type * as agentMessages from "../agentMessages.js";
import type * as agentSessions from "../agentSessions.js";
import type * as chat from "../chat.js";
import type * as containerBuilds from "../containerBuilds.js";
import type * as containers from "../containers.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as internal_aiResponses from "../internal/aiResponses.js";
import type * as internal_cascadeDelete from "../internal/cascadeDelete.js";
import type * as internal_history from "../internal/history.js";
import type * as internal_metrics from "../internal/metrics.js";
import type * as internal_phaseTransitions from "../internal/phaseTransitions.js";
import type * as internal_tailscale from "../internal/tailscale.js";
import type * as internal_updateUtils from "../internal/updateUtils.js";
import type * as internal_webhookProcessing from "../internal/webhookProcessing.js";
import type * as notifications from "../notifications.js";
import type * as phaseConfigs from "../phaseConfigs.js";
import type * as projects from "../projects.js";
import type * as pullRequests from "../pullRequests.js";
import type * as remediationCycles from "../remediationCycles.js";
import type * as secrets from "../secrets.js";
import type * as seed from "../seed.js";
import type * as servers from "../servers.js";
import type * as settings from "../settings.js";
import type * as tailscale from "../tailscale.js";
import type * as taskPhases from "../taskPhases.js";
import type * as tasks from "../tasks.js";
import type * as tests from "../tests.js";
import type * as validators from "../validators.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  acceptanceCriteria: typeof acceptanceCriteria;
  agentMessages: typeof agentMessages;
  agentSessions: typeof agentSessions;
  chat: typeof chat;
  containerBuilds: typeof containerBuilds;
  containers: typeof containers;
  crons: typeof crons;
  http: typeof http;
  "internal/aiResponses": typeof internal_aiResponses;
  "internal/cascadeDelete": typeof internal_cascadeDelete;
  "internal/history": typeof internal_history;
  "internal/metrics": typeof internal_metrics;
  "internal/phaseTransitions": typeof internal_phaseTransitions;
  "internal/tailscale": typeof internal_tailscale;
  "internal/updateUtils": typeof internal_updateUtils;
  "internal/webhookProcessing": typeof internal_webhookProcessing;
  notifications: typeof notifications;
  phaseConfigs: typeof phaseConfigs;
  projects: typeof projects;
  pullRequests: typeof pullRequests;
  remediationCycles: typeof remediationCycles;
  secrets: typeof secrets;
  seed: typeof seed;
  servers: typeof servers;
  settings: typeof settings;
  tailscale: typeof tailscale;
  taskPhases: typeof taskPhases;
  tasks: typeof tasks;
  tests: typeof tests;
  validators: typeof validators;
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
