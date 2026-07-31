import type { Access, Where } from 'payload';

/**
 * CNT01-04 — The publish denial, in code. (design.md §6.2, ADR-0001)
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
 * Note the asymmetry (tasks.md CNT01-S2): collection-level access may return
 * a query constraint; field-level access returns only a boolean. The publish
 * block must live here, at collection level. Field locks (title, slug) live
 * at field level — see `lockedForAgent`.
 *
 * Payload's Admin UI hides Publish/Unpublish for any user whose constraint
 * prevents publishing, so the rule is visible in the interface as well as
 * enforced at the API.
 */
export const agentCannotPublish: Access = ({ req, data }) => {
  const user = req.user as { role?: string } | null;
  if (!user) return false;
  if (user.role !== 'agent') return true;

  // Deny promotion: incoming _status may never be "published" for the agent.
  if (data && (data as { _status?: string })._status === 'published') {
    return false;
  }

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
  const user = req.user as { role?: string } | null;
  if (!user) return false;
  if (user.role !== 'agent') return true;
  if (data && (data as { _status?: string })._status === 'published') {
    return false;
  }
  return true;
};

/** Agents may never delete content. */
export const agentCannotDelete: Access = ({ req }) => {
  const user = req.user as { role?: string } | null;
  if (!user) return false;
  return user.role !== 'agent';
};

/**
 * CNT01-07 — field-level lock for the join key and public URL.
 * Field-level access returns only a boolean: `false` means the incoming
 * value for this field is stripped from the update, while the rest of the
 * document update proceeds (partial-update semantics, asserted by test).
 */
export const lockedForAgent = ({ req }: { req: { user?: unknown } }): boolean => {
  const user = req.user as { role?: string } | null | undefined;
  return user?.role !== 'agent';
};
