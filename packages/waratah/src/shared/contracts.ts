import type { CompiledStateGraph } from '@langchain/langgraph';

import type { HarnessLimits } from './errors.js';
import type { SessionId, SessionPath, StepId, TurnId } from './ids.js';
import { asSessionPath } from './ids.js';

export type WaratahCompiledGraph = CompiledStateGraph<unknown, unknown>;

export type AgentKind = 'lead' | 'subagent';

export interface AgentDefinition {
  readonly name: string;
  readonly kind: AgentKind;
  readonly model: string;
  readonly instructions: readonly string[];
  readonly skills: readonly string[];
  readonly memory: readonly string[];
  readonly tools: readonly ToolDefinition[];
  readonly subagents: readonly AgentDefinition[];
  readonly channels: readonly ChannelDefinition[];
}

export interface CreateAgentInput
  extends Omit<AgentDefinition, 'kind' | 'skills' | 'memory'> {
  readonly kind?: AgentKind;
  readonly skills?: readonly string[];
  readonly memory?: readonly string[];
}

export interface CompiledAgent {
  readonly definition: AgentDefinition;
  readonly manifest: WaratahManifest;
  readonly graph: WaratahCompiledGraph;
}

export interface ChannelDefinition {
  readonly name: string;
  readonly description: string;
}

export interface Schema<T> {
  readonly parse: (input: unknown) => T;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Schema<TInput>;
  readonly execute: (
    input: TInput,
    context: ToolExecutionContext,
  ) => Promise<TOutput>;
}

export interface ToolExecutionContext {
  readonly sessionId: SessionId;
  readonly turnId: TurnId;
  readonly stepId: StepId;
  readonly agentName: string;
  readonly files: SessionFilesystem;
  readonly signal: AbortSignal;
}

export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export type ModelMessage =
  | { readonly role: 'system'; readonly content: string }
  | { readonly role: 'user'; readonly content: string }
  | {
      readonly role: 'assistant';
      readonly content: string;
      readonly toolCalls?: readonly ModelToolCall[];
    }
  | {
      readonly role: 'tool';
      readonly toolCallId: string;
      readonly content: string;
    };

export interface ModelToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export type ModelResult =
  | { readonly type: 'message'; readonly content: string }
  | {
      readonly type: 'tool_calls';
      readonly toolCalls: readonly ModelToolCall[];
    };

export interface ModelAdapter {
  complete(request: {
    readonly model: string;
    readonly messages: readonly ModelMessage[];
    readonly tools: readonly ToolDescriptor[];
    readonly signal: AbortSignal;
  }): Promise<ModelResult>;
}

export type SessionStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface CreateSessionCommand {
  readonly deliveryId: string;
  readonly trigger: 'manual' | 'cron' | 'http';
  readonly triggeredAt: string;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface CreateSessionResult {
  readonly sessionId: SessionId;
  readonly accepted: boolean;
  readonly duplicateOf?: SessionId;
}

export const threadIdFor = (deliveryId: string): string => deliveryId;

export interface SessionEntry {
  readonly path: SessionPath;
  readonly kind: 'file' | 'directory';
}

export interface SessionFilesystem {
  read(path: SessionPath): Promise<string>;
  write(path: SessionPath, content: string): Promise<void>;
  list(path: SessionPath): Promise<readonly SessionEntry[]>;
}

export interface TaskToolInput {
  readonly subagent: string;
  readonly instruction: string;
}

export interface TaskToolResult {
  readonly subagent: string;
  readonly findingPath: SessionPath;
  readonly summary: string;
}

export const findingPath = (
  sessionId: SessionId,
  subagentName: string,
): SessionPath =>
  asSessionPath(`/session/${sessionId}/findings/${subagentName}.md`);

export interface CronTick {
  readonly scheduleId: string;
  readonly deliveryId: string;
  readonly triggeredAt: string;
}

export interface DailyChangesInput {
  readonly since: string;
  readonly until: string;
  readonly repository: string;
  readonly branch: string;
}

export interface PostSessionBody {
  readonly deliveryId: string;
  readonly triggeredAt: string;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export type PostSessionResponse =
  | { readonly status: 'accepted'; readonly sessionId: string }
  | {
      readonly status: 'duplicate';
      readonly sessionId: string;
      readonly duplicateOf: string;
    };

export interface FileChange {
  readonly path: string;
  readonly status: 'added' | 'modified' | 'deleted' | 'renamed';
}

export interface CommitSummary {
  readonly sha: string;
  readonly message: string;
  readonly author: string;
  readonly committedAt: string;
  readonly files: readonly FileChange[];
}

export interface PullRequestSummary {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: string;
}

export interface RepositoryChanges {
  readonly repository: string;
  readonly branch: string;
  readonly since: string;
  readonly until: string;
  readonly commits: readonly CommitSummary[];
  readonly pullRequests: readonly PullRequestSummary[];
}

export interface SlackPostInput {
  readonly channel: string;
  readonly text: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface SlackPostResult {
  readonly ok: boolean;
  readonly messageTs?: string;
}

export interface ManifestFileRef {
  readonly path: string;
  readonly hash: string;
}

export interface ManifestAgent {
  readonly name: string;
  readonly kind: AgentKind;
  readonly model: string;
  readonly instructions: readonly ManifestFileRef[];
  readonly skills: readonly ManifestFileRef[];
  readonly memory: readonly ManifestFileRef[];
  readonly tools: readonly string[];
  readonly channels: readonly string[];
  readonly subagents: readonly ManifestAgent[];
}

export interface WaratahManifest {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly agent: ManifestAgent;
}

export type { HarnessLimits };
