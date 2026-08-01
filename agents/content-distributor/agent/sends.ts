/**
 * The approval flow, the ESP draft path, and the send record.
 *
 * Nothing sends without a human, and the approval is per send: it names the
 * adaptation's content hash, so an edited adaptation invalidates its
 * approval. The ESP path creates drafts and has no send method to misuse —
 * the send itself is a human act in the ESP, recorded here afterwards for
 * attribution.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import { looksLikeAgent } from '../../../packages/content-pipeline/src/humanApproval';
import { adaptationHash, type Adaptation } from './adapt';

const distDir = (root: string) => path.join(root, 'agents', 'content', 'artifacts', 'distribution');

export class SendNotApprovedError extends Error {}

export interface SendApproval {
  sendId: string;
  slug: string;
  surface: string;
  contentHash: string;
  approver: string;
  approvedAt: string;
}

/** A human approves one specific send of one specific adaptation. */
export const approveSend = (root: string, adaptation: Adaptation, approver: string): SendApproval => {
  if (looksLikeAgent(approver)) {
    throw new SendNotApprovedError(`approval requires a named human (got "${approver}") — a human confirms each send, per send`);
  }
  const contentHash = adaptationHash(adaptation);
  const sendId = `${adaptation.slug}-${adaptation.surface}-${contentHash.slice(0, 8)}`;
  const approval: SendApproval = {
    sendId,
    slug: adaptation.slug,
    surface: adaptation.surface,
    contentHash,
    approver,
    approvedAt: new Date().toISOString(),
  };
  const dir = path.join(distDir(root), 'approvals');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${sendId}.yaml`), toYaml(approval));
  return approval;
};

/** The gate the send path calls. Approval must exist and match this exact content. */
export const assertApproved = (root: string, adaptation: Adaptation): SendApproval => {
  const contentHash = adaptationHash(adaptation);
  const sendId = `${adaptation.slug}-${adaptation.surface}-${contentHash.slice(0, 8)}`;
  const file = path.join(distDir(root), 'approvals', `${sendId}.yaml`);
  if (!existsSync(file)) {
    throw new SendNotApprovedError(
      `no approval for send ${sendId} — a human approves each send of each adaptation; an edit invalidates prior approval`,
    );
  }
  const approval = parseYaml(readFileSync(file, 'utf8')) as SendApproval;
  if (approval.contentHash !== contentHash) {
    throw new SendNotApprovedError(`approval ${sendId} does not match this content — re-approve after edits`);
  }
  return approval;
};

/**
 * The ESP client. Deliberately: there is no send method on this interface.
 * The newsletter path ends at a draft in the ESP, unsent.
 */
export interface EspClient {
  createDraft(draft: { subject: string; body: string; canonicalUrl: string }): Promise<{ espDraftId: string }> | { espDraftId: string };
}

/** Local adapter: the draft lands in agents/content/artifacts/distribution/esp-drafts/, mirroring the ESP the way agents/content/artifacts mirrors the CMS. */
export class FileEspAdapter implements EspClient {
  constructor(private readonly root: string) {}

  createDraft(draft: { subject: string; body: string; canonicalUrl: string }): { espDraftId: string } {
    const dir = path.join(distDir(this.root), 'esp-drafts');
    mkdirSync(dir, { recursive: true });
    const espDraftId = `esp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    writeFileSync(path.join(dir, `${espDraftId}.yaml`), toYaml({ espDraftId, status: 'draft-unsent', ...draft }));
    return { espDraftId };
  }
}

/** The newsletter path: approved adaptation → draft in the ESP, unsent. */
export const createNewsletterDraft = async (
  root: string,
  adaptation: Adaptation,
  esp: EspClient,
): Promise<{ espDraftId: string; approval: SendApproval }> => {
  const approval = assertApproved(root, adaptation);
  const { espDraftId } = await esp.createDraft({
    subject: adaptation.title,
    body: adaptation.body,
    canonicalUrl: adaptation.canonicalUrl,
  });
  return { espDraftId, approval };
};

export interface SendRecord {
  sendId: string;
  slug: string;
  surface: string;
  approver: string;
  approvedAt: string;
  sentAt: string;
  contentHash: string;
  espDraftId?: string;
  guardrails?: { engagedOpenRate30d?: number; unsubscribeRate?: number; netNewSubscribers?: number; capturedAt: string };
}

/** After the human sends in the ESP: the record links the send to its source piece, surface and approver. */
export const recordSend = (root: string, adaptation: Adaptation, espDraftId?: string): SendRecord => {
  const approval = assertApproved(root, adaptation);
  const record: SendRecord = {
    sendId: approval.sendId,
    slug: approval.slug,
    surface: approval.surface,
    approver: approval.approver,
    approvedAt: approval.approvedAt,
    sentAt: new Date().toISOString(),
    contentHash: approval.contentHash,
    espDraftId,
  };
  const dir = path.join(distDir(root), 'sends');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${approval.sendId}.yaml`), toYaml(record));
  return record;
};

/** Guardrail metrics captured against the send — subscribers is gameable without them. */
export const recordGuardrails = (
  root: string,
  sendId: string,
  metrics: { engagedOpenRate30d?: number; unsubscribeRate?: number; netNewSubscribers?: number },
): SendRecord => {
  const file = path.join(distDir(root), 'sends', `${sendId}.yaml`);
  if (!existsSync(file)) throw new Error(`no send record ${sendId}`);
  const record = parseYaml(readFileSync(file, 'utf8')) as SendRecord;
  record.guardrails = { ...metrics, capturedAt: new Date().toISOString() };
  writeFileSync(file, toYaml(record));
  return record;
};

/** Per-piece attribution, available to content-analyst: every send for a slug, with its guardrails. */
export const sendsForSlug = (root: string, slug: string): SendRecord[] => {
  const dir = path.join(distDir(root), 'sends');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => parseYaml(readFileSync(path.join(dir, f), 'utf8')) as SendRecord)
    .filter((r) => r.slug === slug);
};
