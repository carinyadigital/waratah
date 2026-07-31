import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { checkAdaptation, type Adaptation } from '../agent/adapt';
import {
  approveSend,
  assertApproved,
  createNewsletterDraft,
  FileEspAdapter,
  recordGuardrails,
  recordSend,
  SendNotApprovedError,
  sendsForSlug,
} from '../agent/sends';
import { claimNode, doc, heading, paragraph, textNode } from '../../../packages/content-pipeline/src/lexical/claim';
import type { ClaimPolicy, DraftArtifact, SurfaceSpec } from '../../../packages/content-pipeline/src/gates/types';
import { r4 } from '../../../scripts/agents/rules';

const here = path.dirname(fileURLToPath(import.meta.url));

const policy: ClaimPolicy = {
  prohibited: [{ id: 'carbon-neutral', pattern: 'carbon[ -]?neutral|net[ -]?zero', reason: 'no certified accounting' }],
  categories: [{ id: 'nutrition', maxSourceAgeMonths: 24, patterns: ['nutrient[ -]dense', 'omega[ -]?3'] }],
};

const newsletterSpec: SurfaceSpec = {
  id: 'newsletter',
  readability: { minFlesch: 55, maxFlesch: 95 },
  words: { min: 20, max: 800 },
  decayHalfLifeMonths: 6,
  requiresInternalLinks: false,
  canonical: false,
};

const source: DraftArtifact = {
  slug: 'slow-roasted-highland-beef',
  title: 'Slow-roasted Highland beef',
  surface: 'recipes',
  content: doc(
    heading('h2', 'Why this cut'),
    paragraph(
      claimNode('c1', 'Grass-finishing lifts omega-3 precursors relative to grain-finishing'),
      textNode(' — and the method is patience.'),
    ),
  ),
};

const adaptation = (over: Partial<Adaptation> = {}): Adaptation => ({
  slug: 'slow-roasted-highland-beef',
  surface: 'newsletter',
  title: 'The roast that waits for you',
  body: 'The shoulder roast rewards patience more than technique. The full method, timings and the herd records are on the farm site: https://carinyaparc.com.au/slow-roasted-highland-beef — dinner and the evidence from the same ground.',
  canonicalUrl: 'https://carinyaparc.com.au/slow-roasted-highland-beef',
  claims: [],
  ...over,
});

describe('nothing sends without a human', () => {
  it('the manifest requires approval human; R4 fails anything weaker', () => {
    const manifest = parseYaml(readFileSync(path.join(here, '..', 'agent.yaml'), 'utf8'));
    expect(manifest.policy.approval).toBe('human');
    expect(manifest.policy.writes).toContain('email-send');

    const weakened = structuredClone(manifest);
    weakened.policy.approval = 'draft-only';
    const violations = r4({
      root: '/',
      manifests: [{ dir: 'content-distributor', file: 'x', manifest: weakened }],
      connections: { connections: {} },
    });
    expect(violations.map((v) => v.rule)).toContain('R4');
  });

  it('a human confirms each send, per send — and per exact content', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dist-'));
    const a = adaptation();
    expect(() => assertApproved(root, a)).toThrow(SendNotApprovedError);
    expect(() => approveSend(root, a, 'content-distributor')).toThrow(/named human/);

    approveSend(root, a, 'Jonno');
    expect(assertApproved(root, a).approver).toBe('Jonno');

    // Editing the adaptation invalidates the approval.
    const edited = adaptation({ body: `${a.body} PS: bring friends.` });
    expect(() => assertApproved(root, edited)).toThrow(SendNotApprovedError);
  });
});

describe('published work is adapted, not rewritten', () => {
  it('a faithful adaptation passes', () => {
    const result = checkAdaptation(adaptation(), source, newsletterSpec, policy);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('a claim absent from the source document is refused — adaptations only narrow', () => {
    const widened = adaptation({
      claims: [{ claimId: 'c9', text: 'our beef is the most nutritious in NSW' }],
      body: 'our beef is the most nutritious in NSW. Full story: https://carinyaparc.com.au/slow-roasted-highland-beef and that claim came from nowhere at all.',
    });
    const result = checkAdaptation(widened, source, newsletterSpec, policy);
    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('only narrow');
  });

  it('a regulated phrase introduced outside carried claims is refused — the dropped-hedge case', () => {
    const hedgeDropped = adaptation({
      body: 'Our nutrient-dense beef is ready this week. Order via https://carinyaparc.com.au/slow-roasted-highland-beef today.',
    });
    const result = checkAdaptation(hedgeDropped, source, newsletterSpec, policy);
    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('nutrition');
  });

  it('a carried claim keeps its regulated phrasing legal', () => {
    const carried = adaptation({
      claims: [{ claimId: 'c1', text: 'Grass-finishing lifts omega-3 precursors relative to grain-finishing' }],
      body: 'Grass-finishing lifts omega-3 precursors relative to grain-finishing — the sourced version, with the paper linked from the recipe: https://carinyaparc.com.au/slow-roasted-highland-beef. The rest is patience.',
    });
    const result = checkAdaptation(carried, source, newsletterSpec, policy);
    expect(result.failures).toEqual([]);
  });

  it('a carried claim repeated twice in the body is not falsely flagged — every occurrence is stripped, not just the first', () => {
    const claimText = 'Grass-finishing lifts omega-3 precursors relative to grain-finishing';
    const repeated = adaptation({
      claims: [{ claimId: 'c1', text: claimText }],
      body: `${claimText} — a hook worth repeating. ${claimText}. Full story: https://carinyaparc.com.au/slow-roasted-highland-beef.`,
    });
    const result = checkAdaptation(repeated, source, newsletterSpec, policy);
    expect(result.failures).toEqual([]);
  });

  it('missing canonical link and prohibited claims are refused', () => {
    const noLink = adaptation({ body: 'A lovely roast. The end, no link anywhere in this body at all, which is the problem being tested.' });
    expect(checkAdaptation(noLink, source, newsletterSpec, policy).failures.join(' ')).toContain('canonical');

    const prohibited = adaptation({
      body: 'Our carbon neutral roast: https://carinyaparc.com.au/slow-roasted-highland-beef — proudly certified by nobody.',
    });
    expect(checkAdaptation(prohibited, source, newsletterSpec, policy).failures.join(' ')).toContain('carbon-neutral');
  });
});

describe('the newsletter path and send attribution', () => {
  it('an approved adaptation becomes an ESP draft, unsent; the client has no send method', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dist-'));
    const a = adaptation();
    approveSend(root, a, 'Jonno');
    const esp = new FileEspAdapter(root);
    const { espDraftId } = await createNewsletterDraft(root, a, esp);

    const draft = parseYaml(
      readFileSync(path.join(root, '.agency/distribution/esp-drafts', `${espDraftId}.yaml`), 'utf8'),
    );
    expect(draft.status).toBe('draft-unsent');
    expect('send' in esp).toBe(false);
  });

  it('an unapproved adaptation cannot even become a draft', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dist-'));
    await expect(createNewsletterDraft(root, adaptation(), new FileEspAdapter(root))).rejects.toThrow(
      SendNotApprovedError,
    );
  });

  it('a send is recorded with source piece, surface and approver; guardrails attach to the same record', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dist-'));
    const a = adaptation();
    approveSend(root, a, 'Jonno');
    const record = recordSend(root, a, 'esp-123');
    expect(record).toMatchObject({ slug: 'slow-roasted-highland-beef', surface: 'newsletter', approver: 'Jonno' });

    recordGuardrails(root, record.sendId, { engagedOpenRate30d: 0.44, unsubscribeRate: 0.004, netNewSubscribers: 12 });
    const [attributed] = sendsForSlug(root, 'slow-roasted-highland-beef');
    expect(attributed.guardrails?.engagedOpenRate30d).toBe(0.44);
    expect(attributed.guardrails?.unsubscribeRate).toBe(0.004);
  });
});
