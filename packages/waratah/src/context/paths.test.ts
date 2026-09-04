import { describe, expect, it } from 'vitest';

import type { SessionId } from '../shared/ids.js';
import { MAX_SESSION_PATH_BYTES, normalizeSessionPath } from './paths.js';

const sessionId = 'S' as SessionId;

describe('normalizeSessionPath', () => {
  it.each([
    ['/session/S/findings/example.md', '/session/S/findings/example.md'],
    ['findings/example.md', '/session/S/findings/example.md'],
    ['/session/S', '/session/S'],
    ['findings/cafe\u0301.md', '/session/S/findings/café.md'],
  ])('normalizes %j within the active session', (input, expected) => {
    expect(normalizeSessionPath(sessionId, input)).toBe(expected);
  });

  it.each([
    ['parent traversal', '../other/secret.md'],
    ['nested traversal', 'findings/../../other/secret.md'],
    ['absolute escape', '/other/secret.md'],
    ['different session', '/session/T/findings/secret.md'],
    ['case-swapped session', '/session/s/findings/secret.md'],
    ['empty path', ''],
    ['whitespace-only path', ' \t'],
    ['null byte', 'findings/secret\0.md'],
    ['line feed', 'findings/report\nFORGED.md'],
    ['carriage return', 'findings/report\rFORGED.md'],
    ['C1 control', 'findings/report\u0085FORGED.md'],
    ['bidi embedding', 'findings/\u202Areport.md'],
    ['bidi override', 'findings/\u202Efdp.md'],
    ['zero-width formatting', 'findings/report\u200B.md'],
    ['invisible formatting', 'findings/report\u2060.md'],
    ['line separator', 'findings/report\u2028FORGED.md'],
    ['paragraph separator', 'findings/report\u2029FORGED.md'],
    ['unpaired high surrogate', 'findings/report\uD800.md'],
    ['unpaired low surrogate', 'findings/report\uDC00.md'],
    ['backslash traversal', String.raw`findings\..\secret.md`],
    ['mixed-separator traversal', String.raw`findings/..\secret.md`],
    ['encoded traversal', 'findings/%2e%2e/secret.md'],
    ['double-encoded traversal', 'findings/%252e%252e/secret.md'],
    ['encoded separator', 'findings%2fsecret.md'],
    ['fullwidth traversal', 'findings/．．/secret.md'],
    ['NFKD-created traversal', 'findings/․․/secret.md'],
    ['division slash', 'findings∕secret.md'],
    ['fullwidth slash', 'findings／secret.md'],
    ['NFKD-created separator', 'findings℀secret.md'],
    ['reverse solidus', 'findings⧵secret.md'],
    ['repeated separator', '/session/S//findings/example.md'],
    ['current-directory segment', '/session/S/./findings/example.md'],
    ['trailing separator', '/session/S/findings/'],
    ['trailing-dot segment', '/session/S/findings./example.md'],
    ['dot-only segment', '/session/S/findings/.../example.md'],
  ])('rejects %s', (_description, input) => {
    expect(() => normalizeSessionPath(sessionId, input)).toThrowError(
      expect.objectContaining({ code: 'INVALID_SESSION_PATH' }),
    );
  });

  it('rejects a path beyond the explicit byte limit', () => {
    const input = 'a'.repeat(MAX_SESSION_PATH_BYTES + 1);

    expect(() => normalizeSessionPath(sessionId, input)).toThrowError(
      expect.objectContaining({ code: 'INVALID_SESSION_PATH' }),
    );
  });

  it('accepts a multibyte path at exactly the canonical byte limit', () => {
    const rootPrefix = `/session/${sessionId}/`;
    const availableBytes = MAX_SESSION_PATH_BYTES - Buffer.byteLength(rootPrefix, 'utf8');
    const input = `a${'é'.repeat((availableBytes - 1) / 2)}`;

    const normalizedPath = normalizeSessionPath(sessionId, input);

    expect(Buffer.byteLength(normalizedPath, 'utf8')).toBe(MAX_SESSION_PATH_BYTES);
  });

  it('rejects a multibyte path one byte beyond the canonical byte limit', () => {
    const rootPrefix = `/session/${sessionId}/`;
    const availableBytes = MAX_SESSION_PATH_BYTES - Buffer.byteLength(rootPrefix, 'utf8');
    const input = `${'é'.repeat((availableBytes - 1) / 2)}ab`;

    expect(() => normalizeSessionPath(sessionId, input)).toThrowError(
      expect.objectContaining({ code: 'INVALID_SESSION_PATH' }),
    );
  });
});
