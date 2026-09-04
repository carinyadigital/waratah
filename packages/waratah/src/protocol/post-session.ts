import type { PostSessionResponse } from '../shared/contracts.js';
import { isWaratahError, type WaratahErrorCode } from '../shared/errors.js';
import { InvalidSessionRequest, type CreateSessionService } from '../session/create-session.js';

export interface PostSessionOptions {
  readonly sessions: CreateSessionService;
}

export interface ProtocolErrorResponse {
  readonly error: {
    readonly code: WaratahErrorCode | 'INVALID_REQUEST' | 'INTERNAL_ERROR';
    readonly message: string;
  };
}

export interface PostSessionResult {
  readonly statusCode: 202 | 400 | 500 | 503;
  readonly body: PostSessionResponse | ProtocolErrorResponse;
}

/** Accepts an HTTP trigger through the shared session-creation service. */
export async function postSession(
  options: PostSessionOptions,
  body: unknown,
): Promise<PostSessionResult> {
  try {
    const result = await options.sessions.create(httpCommand(body));
    if (!result.accepted) {
      return {
        statusCode: 202,
        body: {
          status: 'duplicate',
          sessionId: result.sessionId,
          duplicateOf: result.duplicateOf ?? result.sessionId,
        },
      };
    }

    return {
      statusCode: 202,
      body: { status: 'accepted', sessionId: result.sessionId },
    };
  } catch (error) {
    return postSessionFailure(error);
  }
}

function httpCommand(body: unknown): unknown {
  return isRecord(body) ? { ...body, trigger: 'http' } : body;
}

export function postSessionFailure(error: unknown): PostSessionResult {
  if (error instanceof InvalidSessionRequest) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'INVALID_REQUEST',
          message: 'The session request is invalid.',
        },
      },
    };
  }

  if (!isWaratahError(error)) {
    return internalFailure();
  }

  switch (error.code) {
    case 'PAYLOAD_LIMIT_EXCEEDED':
      return {
        statusCode: 400,
        body: {
          error: {
            code: error.code,
            message: 'The session request exceeds the allowed size.',
          },
        },
      };
    case 'SESSION_STORE_ERROR':
      return {
        statusCode: 503,
        body: {
          error: {
            code: error.code,
            message: 'The session store is unavailable.',
          },
        },
      };
    default:
      return internalFailure();
  }
}

function internalFailure(): PostSessionResult {
  return {
    statusCode: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The session could not be accepted.',
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
