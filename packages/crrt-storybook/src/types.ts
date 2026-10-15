/**
 * v1 rule status is informational: the panel *displays* governance, it does not
 * yet compute compliance against the rendered DOM (that is v2). `pass`/`warn`/
 * `fail` are accepted so a build step or future computation can set them.
 */
export type CrrtRuleStatus = "info" | "pass" | "warn" | "fail";

/** One governance rule shown as a card in the Compliance section. */
export interface CrrtRule {
  /** Rule identifier, e.g. "business/auth-access" or "design/one-primary-button". */
  id: string;
  /** One-line essence of the rule, readable by a stakeholder. */
  essence: string;
  /** Defaults to "info" (informational) in v1. */
  status?: CrrtRuleStatus;
  /** Optional link to the full rule (repo file, wiki page). */
  href?: string;
}

/**
 * Addon configuration, set via Storybook parameters under the `crrt` key.
 * Global values go in `.storybook/preview.ts`; `rules` usually per component
 * (story meta) so each component surfaces its own governance.
 */
export interface CrrtParameters {
  /** Public opaque identifier created by CRRT's one-command connection flow. */
  connectionId?: string;
  /** CRRT project key — comments post to this project. Required to send feedback. */
  projectId?: string;
  /** Override the hosted API base. Default: https://crrt.ai/api */
  apiBase?: string;
  /** Where the sent-state "Open dashboard" link points. Default: https://crrt.ai */
  dashboardUrl?: string;
  /** Rules governing this component/story, shown in the Compliance section. */
  rules?: CrrtRule[];
  /** Set to false to skip the built-in DOM checks for a story. Default: true. */
  checks?: boolean;
}

/** The story context the panel attaches to every comment. */
export interface StoryContext {
  storyId: string;
  /** Component path in the sidebar, e.g. "Components/Button". */
  componentTitle: string;
  /** Story (variant) name, e.g. "Default". */
  storyName: string;
}
