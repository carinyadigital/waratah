import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { corpusSlugs, repoPaths } from '../src/artifacts';

describe('corpusSlugs — known documents for internal-link resolution', () => {
  const scaffold = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'artifacts-'));
    return repoPaths(root);
  };

  it('includes staged drafts, by filename', () => {
    const paths = scaffold();
    mkdirSync(path.join(paths.content, 'drafts'), { recursive: true });
    writeFileSync(path.join(paths.content, 'drafts', 'a-draft.json'), '{}');

    expect(corpusSlugs(paths)).toEqual(['a-draft']);
  });

  it('also includes the local published mirror, by each document\'s own slug field', () => {
    const paths = scaffold();
    mkdirSync(path.join(paths.content, 'drafts'), { recursive: true });
    mkdirSync(path.join(paths.content, 'published'), { recursive: true });
    writeFileSync(path.join(paths.content, 'drafts', 'a-draft.json'), '{}');
    // filename need not match slug — content-monitor's corpus assembly reads by slug field too.
    writeFileSync(path.join(paths.content, 'published', 'doc-1.json'), JSON.stringify({ slug: 'already-published' }));

    expect(corpusSlugs(paths).sort()).toEqual(['a-draft', 'already-published']);
  });

  it('is empty when neither directory exists', () => {
    expect(corpusSlugs(scaffold())).toEqual([]);
  });
});
