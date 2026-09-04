import { join, resolve } from 'node:path';

import { SESSION_ID_PATTERN } from '../context/paths.js';
import { WaratahError } from '../shared/errors.js';
import type { SessionId } from '../shared/ids.js';

export const SESSION_STORE_SEGMENT = 'session';
export const SESSION_FILES_SEGMENT = 'files';
export const SESSION_META_FILE = 'meta.json';
export const SESSION_TRANSCRIPT_FILE = 'transcript.jsonl';

export function sessionStoreRoot(projectRoot: string): string {
  return join(resolve(projectRoot), '.waratah', SESSION_STORE_SEGMENT);
}

export function sessionDirectory(projectRoot: string, sessionId: string): string {
  assertSessionDirectoryId(sessionId);
  // Percent-encode so timestamp delivery IDs (`:` / `+`) are valid path segments.
  return join(sessionStoreRoot(projectRoot), encodeURIComponent(sessionId));
}

export function sessionFilesDirectory(projectRoot: string, sessionId: string): string {
  return join(sessionDirectory(projectRoot, sessionId), SESSION_FILES_SEGMENT);
}

export function sessionMetaPath(projectRoot: string, sessionId: string): string {
  return join(sessionDirectory(projectRoot, sessionId), SESSION_META_FILE);
}

export function sessionTranscriptPath(projectRoot: string, sessionId: string): string {
  return join(sessionDirectory(projectRoot, sessionId), SESSION_TRANSCRIPT_FILE);
}

export function assertSessionDirectoryId(sessionId: string): asserts sessionId is SessionId {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new WaratahError(
      'INVALID_SESSION_PATH',
      'The session path is invalid. Use a path within the active session root.',
    );
  }
}
