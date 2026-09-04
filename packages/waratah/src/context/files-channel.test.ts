import { describe, expect, it } from 'vitest';

import { mergeFiles } from './files-channel.js';

describe('mergeFiles', () => {
  it('keeps distinct paths from both updates', () => {
    expect(
      mergeFiles(
        { '/session/S/findings/a.md': 'a' },
        { '/session/S/findings/b.md': 'b' },
      ),
    ).toEqual({
      '/session/S/findings/a.md': 'a',
      '/session/S/findings/b.md': 'b',
    });
  });

  it('lets the later write win for the same path', () => {
    expect(
      mergeFiles(
        { '/session/S/findings/a.md': 'first' },
        { '/session/S/findings/a.md': 'second' },
      ),
    ).toEqual({
      '/session/S/findings/a.md': 'second',
    });
  });
});
