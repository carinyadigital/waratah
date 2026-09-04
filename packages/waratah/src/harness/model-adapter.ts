import type {
  ModelAdapter,
  ModelMessage,
  ModelResult,
  ModelToolCall,
  ToolDescriptor,
} from '../shared/contracts.js';
import { WaratahError } from '../shared/errors.js';

export type { ModelAdapter };

export interface ModelCompletionRequest {
  readonly model: string;
  readonly messages: readonly ModelMessage[];
  readonly tools: readonly ToolDescriptor[];
  readonly signal: AbortSignal;
}

export async function completeModel(
  adapter: ModelAdapter,
  request: ModelCompletionRequest,
): Promise<ModelResult> {
  try {
    const result: unknown = await adapter.complete(request);
    if (!isModelResult(result)) {
      throw new TypeError('Invalid model result');
    }
    return result;
  } catch {
    throw new WaratahError(
      'MODEL_ERROR',
      'The model request failed. Check provider availability and configuration before retrying.',
    );
  }
}

function isModelResult(result: unknown): result is ModelResult {
  if (!isRecord(result)) {
    return false;
  }
  if (result.type === 'message') {
    return typeof result.content === 'string';
  }
  if (result.type !== 'tool_calls' || !Array.isArray(result.toolCalls)) {
    return false;
  }
  return result.toolCalls.every(isModelToolCall);
}

function isModelToolCall(call: unknown): call is ModelToolCall {
  return (
    isRecord(call) &&
    typeof call.id === 'string' &&
    call.id.length > 0 &&
    typeof call.name === 'string' &&
    call.name.length > 0 &&
    isRecord(call.arguments)
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}
