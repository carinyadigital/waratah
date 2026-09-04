import type { SessionId, StepId, TurnId } from '../shared/ids.js';

/** The trusted tool-call details available to an approval policy. */
export interface ApprovalRequest {
  readonly callId: string;
  readonly sessionId: SessionId;
  readonly turnId: TurnId;
  readonly stepId: StepId;
  readonly agentName: string;
  readonly toolName: string;
  readonly input: unknown;
}

/** A policy result that either permits execution or stops it at the boundary. */
export type ApprovalDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason?: string };

/** Intercepts every valid tool call before authored tool code can execute. */
export interface ApprovalPolicy {
  evaluate(request: ApprovalRequest): ApprovalDecision | Promise<ApprovalDecision>;
}

/** Phase 1 policy that preserves the interception point without prompting. */
export const allowOnlyApprovalPolicy: ApprovalPolicy = Object.freeze({
  evaluate: () => ({ allowed: true }),
});
