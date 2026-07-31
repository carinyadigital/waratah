import type { Access, Where } from 'payload';

type AgentPublishOutcome = { decided: true; allowed: boolean } | { decided: false };

/**
 * The shared prefix both publish-adjacent access rules start from: deny
 * outright for no user, pass through non-agents untouched, and deny an
 * agent's attempt to make _status "published" — on create or update alike.
 * `decided: false` means the caller must apply its own, more specific rule.
 */
const agentPublishAttempt = (req: { user?: unknown }, data: unknown): AgentPublishOutcome => {
  const user = req.user as { role?: string } | null;
  if (!user) return { decided: true, allowed: false };
  if (user.role !== 'agent') return { decided: true, allowed: true };
  if (data && (data as { _status?: string })._status === 'published') {
    return { decided: true, allowed: false };
  }
  return { decided: false };
};

/**
 * The publish denial, in code.
 *
 * Collection-level `update` access for content collections with
 * `versions: { drafts: true }` enabled.
 *
 * For the `agent` role two constraints combine:
 *
 * 1. Boolean denial on intent: an update whose incoming data sets
 *    `_status: "published"` is denied outright. The agent cannot promote
 *    a draft, on any API surface, because this runs server-side inside
 *    Payload's access layer.
 * 2. Query constraint on target: the agent may only update documents that
 *    are not currently published. A published document is entirely out of
 *    reach, so the agent cannot unpublish or edit live content either.
 *
 * Note the asymmetry: collection-level access may return a query constraint;
 * field-level access returns only a boolean. The publish block must live
 * here, at collection level. Field locks (title, slug) live at field level —
 * see `lockedForAgent`.
 *
 * Payload's Admin UI hides Publish/Unpublish for any user whose constraint
 * prevents publishing, so the rule is visible in the interface as well as
 * enforced at the API.
 */
export const agentCannotPublish: Access = ({ req, data }) => {
  const outcome = agentPublishAttempt(req, data);
  if (outcome.decided) return outcome.allowed;

  // Constrain targets: only never-published / draft documents are updatable.
  const constraint: Where = { _status: { not_equals: 'published' } };
  return constraint;
};

/**
 * Create access for content collections: anyone authenticated may create,
 * but the agent role may only create drafts — never a document that is
 * born published.
 */
export const agentCreatesDraftsOnly: Access = ({ req, data }) => {
  const outcome = agentPublishAttempt(req, data);
  return outcome.decided ? outcome.allowed : true;
};

/** Agents may never delete content. */
export const agentCannotDelete: Access = ({ req }) => {
  const user = req.user as { role?: string } | null;
  if (!user) return false;
  return user.role !== 'agent';
};

/**
 * Field-level lock for the join key and public URL.
 * Field-level access returns only a boolean: `false` means the incoming
 * value for this field is stripped from the update, while the rest of the
 * document update proceeds (partial-update semantics, asserted by test).
 */
export const lockedForAgent = ({ req }: { req: { user?: unknown } }): boolean => {
  const user = req.user as { role?: string } | null | undefined;
  return user?.role !== 'agent';
};

/**
 * Public read sees published documents only. Authenticated callers (admin,
 * editor, agent) see drafts too. The `draft` query param alone does not hide
 * `_status: "draft"` — read access must constrain it.
 */
export const publicReadsPublished: Access = ({ req }) => {
  if (req.user) return true;
  const constraint: Where = { _status: { equals: 'published' } };
  return constraint;
};
