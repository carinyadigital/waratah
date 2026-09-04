import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { PHASE_1_LIMITS } from '../harness/limits.js';
import { WaratahError, isWaratahError, type WaratahErrorCode } from '../shared/errors.js';
import { InvalidSessionRequest, type CreateSessionService } from '../session/create-session.js';
import type { SessionId } from '../shared/ids.js';
import {
  postSession,
  postSessionFailure,
  type PostSessionResult,
  type ProtocolErrorResponse,
} from './post-session.js';

export const WARATAH_SERVER_LIMITS = Object.freeze({
  maxRequestBodyBytes: PHASE_1_LIMITS.maxRequestBodyBytes,
  maxHeaderBytes: 16 * 1024,
  maxHeaderCount: 64,
  headersTimeoutMilliseconds: 10_000,
  requestTimeoutMilliseconds: 30_000,
  keepAliveTimeoutMilliseconds: PHASE_1_LIMITS.serverKeepAliveTimeoutMilliseconds,
  maxRequestsPerSocket: PHASE_1_LIMITS.serverMaxRequestsPerSocket,
  shutdownGraceMilliseconds: PHASE_1_LIMITS.serverShutdownGraceMilliseconds,
});

const LOOPBACK_HOST = '127.0.0.1';

export interface WaratahServerAddress {
  readonly host: string;
  readonly port: number;
}

export interface WaratahRunFailure {
  readonly sessionId: SessionId;
  readonly code: WaratahErrorCode | 'INTERNAL_ERROR';
}

export interface WaratahServerOptions {
  readonly sessions: CreateSessionService;
  readonly runSession?: (sessionId: SessionId, signal: AbortSignal) => Promise<void>;
  readonly onRunFailure?: (failure: WaratahRunFailure) => void;
  readonly maxRequestBodyBytes?: number;
  readonly shutdownGraceMilliseconds?: number;
}

export interface WaratahServer {
  listen(port: number): Promise<WaratahServerAddress>;
  close(): Promise<void>;
}

/** Creates waratah's bounded loopback HTTP trigger server. */
export function createWaratahServer(options: WaratahServerOptions): WaratahServer {
  const maxRequestBodyBytes = requestBodyLimit(options.maxRequestBodyBytes);
  const shutdownGraceMilliseconds = shutdownGraceLimit(options.shutdownGraceMilliseconds);
  const runs = new Map<Promise<void>, AbortController>();
  let closePromise: Promise<void> | undefined;
  const server = createHttpServer(
    {
      maxHeaderSize: WARATAH_SERVER_LIMITS.maxHeaderBytes,
      headersTimeout: WARATAH_SERVER_LIMITS.headersTimeoutMilliseconds,
      requestTimeout: WARATAH_SERVER_LIMITS.requestTimeoutMilliseconds,
    },
    (request, response) => {
      void handleRequest(request, response, {
        sessions: options.sessions,
        maxRequestBodyBytes,
        dispatchRun:
          options.runSession === undefined
            ? undefined
            : (sessionId) => superviseRun(sessionId, options, runs),
      }).catch(() => {
        if (!response.headersSent) {
          writeJson(response, 500, internalErrorBody());
        } else if (!response.writableEnded) {
          response.end();
        }
      });
    },
  );
  server.maxHeadersCount = 0;
  server.keepAliveTimeout = WARATAH_SERVER_LIMITS.keepAliveTimeoutMilliseconds;
  server.maxRequestsPerSocket = WARATAH_SERVER_LIMITS.maxRequestsPerSocket;
  server.on('clientError', (_error, socket) => {
    if (socket.writable) {
      const body = JSON.stringify({
        error: {
          code: 'INVALID_REQUEST',
          message: 'The session request is invalid.',
        },
      });
      socket.end(
        `HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
      );
    } else {
      socket.destroy();
    }
  });

  return {
    listen: (port) => listen(server, port),
    close() {
      closePromise ??= closeAndDrain(server, runs, shutdownGraceMilliseconds);
      return closePromise;
    },
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    readonly sessions: CreateSessionService;
    readonly maxRequestBodyBytes: number;
    readonly dispatchRun?: (sessionId: SessionId) => void;
  },
): Promise<void> {
  if (request.rawHeaders.length / 2 > WARATAH_SERVER_LIMITS.maxHeaderCount) {
    request.resume();
    response.shouldKeepAlive = false;
    writeJson(response, 400, invalidRequestBody(), undefined, true);
    response.once('finish', () => request.destroy());
    return;
  }

  const path = requestUrl(request);
  if (path !== '/session') {
    writeJson(response, 404, {
      error: { code: 'NOT_FOUND', message: 'The requested endpoint does not exist.' },
    });
    return;
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    writeJson(response, 405, {
      error: { code: 'METHOD_NOT_ALLOWED', message: 'POST is required for this endpoint.' },
    });
    return;
  }
  if (!isJsonContentType(request.headers['content-type'])) {
    writeJson(response, 415, {
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type must be application/json.',
      },
    });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, options.maxRequestBodyBytes);
  } catch (error) {
    request.resume();
    response.shouldKeepAlive = false;
    const failure = postSessionFailure(error);
    writePostSessionResult(response, failure, undefined, true);
    response.once('finish', () => request.destroy());
    return;
  }

  const result = await postSession(options, body);
  const runSession = options.dispatchRun;
  let dispatchRun: (() => void) | undefined;
  if ('status' in result.body && result.body.status === 'accepted' && runSession !== undefined) {
    const sessionId = result.body.sessionId as SessionId;
    let queued = false;
    const queueRun = (): void => {
      if (queued) {
        return;
      }
      queued = true;
      response.off('close', queueRun);
      runSession(sessionId);
    };
    dispatchRun = queueRun;
    response.once('close', queueRun);
  }
  writePostSessionResult(response, result, dispatchRun);
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const declaredLength = request.headers['content-length'];
  if (
    declaredLength !== undefined &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxBytes
  ) {
    throw new WaratahError(
      'PAYLOAD_LIMIT_EXCEEDED',
      'The payload exceeds the allowed size. Reduce the payload and try again.',
    );
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) {
      throw new WaratahError(
        'PAYLOAD_LIMIT_EXCEEDED',
        'The payload exceeds the allowed size. Reduce the payload and try again.',
      );
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
  } catch {
    throw new InvalidSessionRequest();
  }
}

function superviseRun(
  sessionId: SessionId,
  options: Pick<WaratahServerOptions, 'runSession' | 'onRunFailure'>,
  runs: Map<Promise<void>, AbortController>,
): void {
  const controller = new AbortController();
  const run = (async () => {
    try {
      await options.runSession?.(sessionId, controller.signal);
    } catch (error) {
      try {
        options.onRunFailure?.({
          sessionId,
          code: isWaratahError(error) ? error.code : 'INTERNAL_ERROR',
        });
      } catch {
        // A failure observer cannot be allowed to create an unhandled rejection.
      }
    }
  })();
  runs.set(run, controller);
  void run.finally(() => runs.delete(run));
}

function requestUrl(request: IncomingMessage): string | undefined {
  try {
    return new URL(request.url ?? '', 'http://localhost').pathname;
  } catch {
    return undefined;
  }
}

function isJsonContentType(value: string | undefined): boolean {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function writePostSessionResult(
  response: ServerResponse,
  result: PostSessionResult,
  onSent?: () => void,
  closeConnection = false,
): void {
  writeJson(response, result.statusCode, result.body, onSent, closeConnection);
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  onSent?: () => void,
  closeConnection = false,
): void {
  const content = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(content),
    ...(closeConnection ? { Connection: 'close' } : {}),
  });
  response.end(content, onSent);
}

function internalErrorBody(): ProtocolErrorResponse {
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'The session could not be accepted.',
    },
  };
}

function invalidRequestBody(): ProtocolErrorResponse {
  return {
    error: {
      code: 'INVALID_REQUEST',
      message: 'The session request is invalid.',
    },
  };
}

function requestBodyLimit(requested: number | undefined): number {
  const limit = requested ?? WARATAH_SERVER_LIMITS.maxRequestBodyBytes;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > WARATAH_SERVER_LIMITS.maxRequestBodyBytes
  ) {
    throw new RangeError(
      `maxRequestBodyBytes must be an integer from 1 to ${WARATAH_SERVER_LIMITS.maxRequestBodyBytes}.`,
    );
  }
  return limit;
}

function shutdownGraceLimit(requested: number | undefined): number {
  const limit = requested ?? WARATAH_SERVER_LIMITS.shutdownGraceMilliseconds;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > WARATAH_SERVER_LIMITS.shutdownGraceMilliseconds
  ) {
    throw new RangeError(
      `shutdownGraceMilliseconds must be an integer from 1 to ${WARATAH_SERVER_LIMITS.shutdownGraceMilliseconds}.`,
    );
  }
  return limit;
}

function listen(server: Server, port: number): Promise<WaratahServerAddress> {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    return Promise.reject(new RangeError('Port must be an integer from 0 to 65535.'));
  }

  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('The waratah server did not bind a TCP address.'));
        return;
      }
      resolve({ host: LOOPBACK_HOST, port: address.port });
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, LOOPBACK_HOST);
  });
}

function close(server: Server): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) {
        resolveClose();
      } else {
        rejectClose(error);
      }
    });
  });
}

async function closeAndDrain(
  server: Server,
  runs: Map<Promise<void>, AbortController>,
  shutdownGraceMilliseconds: number,
): Promise<void> {
  await close(server);
  for (const controller of runs.values()) {
    controller.abort();
  }
  if (runs.size === 0) {
    return;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(runs.keys()),
      new Promise<void>((resolveTimer) => {
        timer = setTimeout(resolveTimer, shutdownGraceMilliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
