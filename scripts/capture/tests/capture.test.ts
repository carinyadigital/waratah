import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify as toYaml } from 'yaml';
import { capture } from '../capture';
import { sweepExpiredBriefs } from '../expiry-sweep';
import { Triage } from '../../../agents/content/monitor/agent/triage';
import { loadQueue, promote } from '../../../agents/content/planner/agent/queue';

const IDEA = `what about a piece on why the creek crossing silts up every  winter??
half-formed but there's something in it — maybe tie to the riparian planting`;

describe('capture — an idea reaches Triage in one step', () => {
  it('files the raw text verbatim: no interpretation, expansion or prioritisation', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'capture-'));
    const result = capture(root, { text: IDEA, author: 'jonno' });
    expect(result.outcome).toBe('filed');

    const filed = new Triage(root).get(result.id)!;
    expect(filed.raw).toBe(IDEA); // byte-for-byte, double spaces and all
    expect(filed.author).toBe('jonno');
    expect(filed.kind).toBe('idea');
    // The title is a mechanical truncation of the raw text, not a rewrite.
    expect(IDEA.replace(/\s+/g, ' ').startsWith(filed.title.replace(/\.\.\.$/, ''))).toBe(true);
  });

  it('the same idea captured twice files once', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'capture-'));
    capture(root, { text: IDEA, author: 'jonno' });
    expect(capture(root, { text: IDEA, author: 'jonno' }).outcome).toBe('duplicate');
    expect(new Triage(root).list()).toHaveLength(1);
  });

  it('refuses empty captures and anonymous authors', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'capture-'));
    expect(() => capture(root, { text: '  ', author: 'jonno' })).toThrow();
    expect(() => capture(root, { text: 'an idea', author: '' })).toThrow();
  });
});

describe('expiry sweep — stale briefs expire, reported not silent', () => {
  const scaffold = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sweep-'));
    mkdirSync(path.join(root, 'agents/content/artifacts/briefs'), { recursive: true });
    mkdirSync(path.join(root, 'agents/content/artifacts/drafts'), { recursive: true });
    const brief = (slug: string, expiresAt: string, trackerRef = `triage/${slug}`) =>
      writeFileSync(
        path.join(root, 'agents/content/artifacts/briefs', `${slug}.yaml`),
        toYaml({ slug, expiresAt, trackerRef }),
      );
    return { root, brief };
  };

  it('expires an unstarted brief past its date, moves it out, resolves its triage item', () => {
    const { root, brief } = scaffold();
    const triage = new Triage(root);
    triage.fileItem({ id: 'stale-idea', kind: 'proposed-brief', title: 'stale', evidence: 'e' });
    brief('stale-idea', '2026-01-01', 'triage/stale-idea');
    brief('current-idea', '2099-01-01');

    const report = sweepExpiredBriefs(root, new Date('2026-07-31'));

    expect(report.expired.map((e) => e.slug)).toEqual(['stale-idea']);
    expect(report.kept).toEqual(['current-idea']);
    expect(existsSync(path.join(root, 'agents/content/artifacts/briefs/stale-idea.yaml'))).toBe(false);
    expect(existsSync(path.join(root, 'agents/content/artifacts/briefs/expired/stale-idea.yaml'))).toBe(true);
    expect(triage.get('stale-idea')!.status).toBe('resolved');
  });

  it('a started brief never expires, however old', () => {
    const { root, brief } = scaffold();
    brief('in-progress', '2026-01-01');
    writeFileSync(path.join(root, 'agents/content/artifacts/drafts/in-progress.json'), '{}');
    const report = sweepExpiredBriefs(root, new Date('2026-07-31'));
    expect(report.expired).toHaveLength(0);
    expect(report.kept).toContain('in-progress');
  });

  it('an expired brief is dropped from the ready queue, not left occupying a slot forever', () => {
    const { root, brief } = scaffold();
    brief('promoted-then-stale', '2026-01-01');
    promote(path.join(root, 'agents/content/artifacts'), 'promoted-then-stale', 'Jonno');
    expect(loadQueue(path.join(root, 'agents/content/artifacts')).ready).toContain('promoted-then-stale');

    sweepExpiredBriefs(root, new Date('2026-07-31'));

    expect(loadQueue(path.join(root, 'agents/content/artifacts')).ready).not.toContain('promoted-then-stale');
  });
});
