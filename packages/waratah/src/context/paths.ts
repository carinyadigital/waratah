import path from 'node:path';

import { WaratahError } from '../shared/errors.js';
import type { SessionId, SessionPath } from '../shared/ids.js';

/** Maximum number of UTF-8 bytes accepted for an untrusted session path. */
export const MAX_SESSION_PATH_BYTES = 4_096;

const ENCODED_BYTE = /%[0-9A-Fa-f]{2}/;
const LOOKALIKE_SEPARATOR =
  /[\u2044\u2215\u2571\u27cb\u29f5\u29f6\u29f8\u29f9\u2afb\u2afd\ufe68\uff0f\uff3c]/u;
export const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:+-]*$/;
const UNSAFE_PATH_CHARACTER = /[\p{Cc}\p{Cf}\u2028\u2029]/u;
const UNPAIRED_SURROGATE =
  /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF])/;

/**
 * Produces a canonical path only after proving that it remains inside the
 * active session root. Backends must accept paths exclusively through this
 * boundary so rejected input cannot trigger storage access.
 */
export function normalizeSessionPath(sessionId: SessionId, input: string): SessionPath {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    invalidSessionPath();
  }

  if (
    input.trim().length === 0 ||
    Buffer.byteLength(input, 'utf8') > MAX_SESSION_PATH_BYTES ||
    UNSAFE_PATH_CHARACTER.test(input) ||
    UNPAIRED_SURROGATE.test(input) ||
    input.includes('\\') ||
    LOOKALIKE_SEPARATOR.test(input) ||
    ENCODED_BYTE.test(input)
  ) {
    invalidSessionPath();
  }

  const normalizedInput = input.normalize('NFKC');
  if (
    UNSAFE_PATH_CHARACTER.test(normalizedInput) ||
    UNPAIRED_SURROGATE.test(normalizedInput) ||
    normalizedInput.split('/').length !== input.split('/').length ||
    normalizedInput.includes('\\') ||
    LOOKALIKE_SEPARATOR.test(normalizedInput) ||
    normalizedInput.includes('//') ||
    normalizedInput.endsWith('/')
  ) {
    invalidSessionPath();
  }

  const root = `/session/${sessionId}`;
  let relativePath: string;

  if (normalizedInput.startsWith('/')) {
    if (normalizedInput === root) {
      relativePath = '';
    } else if (normalizedInput.startsWith(`${root}/`)) {
      relativePath = normalizedInput.slice(root.length + 1);
    } else {
      invalidSessionPath();
    }
  } else {
    relativePath = normalizedInput;
  }

  const segments = relativePath === '' ? [] : relativePath.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 || segment === '.' || segment === '..' || segment.endsWith('.'),
    )
  ) {
    invalidSessionPath();
  }

  const normalizedPath = path.posix.resolve(root, relativePath);
  if (
    (normalizedPath !== root && !normalizedPath.startsWith(`${root}/`)) ||
    Buffer.byteLength(normalizedPath, 'utf8') > MAX_SESSION_PATH_BYTES
  ) {
    invalidSessionPath();
  }

  return normalizedPath as SessionPath;
}

function invalidSessionPath(): never {
  throw new WaratahError(
    'INVALID_SESSION_PATH',
    'The session path is invalid. Use a path within the active session root.',
  );
}
