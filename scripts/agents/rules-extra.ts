/**
 * R9–R12. R9 and R10 generalise the access and connection checks that content
 * QA shipped as a one-off; R11 makes the `content:` block real. R12 arrives
 * with the calibration ledger.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadClasses, qualifiesForLevel } from '../../packages/content-pipeline/src/calibration';
import type { Rule, Violation } from './rules';

/**
 * R9 — any agent declaring cms-draft names a CMS role whose access rules are
 * asserted by a test in the site repo. The manifest names both the role
 * (policy.cmsRole) and the asserting test (policy.cmsRoleAssertedBy); check
 * fails if the named test file is absent. This is the only rule that closes
 * the assertion gap between manifest and provider.
 */
export const r9: Rule = ({ root, manifests }) => {
  const violations: Violation[] = [];
  for (const { dir, manifest } of manifests) {
    if (!manifest?.policy) continue;
    if (!(manifest.policy.writes ?? []).includes('cms-draft')) continue;

    if (!manifest.policy.cmsRole) {
      violations.push({ rule: 'R9', agent: dir, message: 'cms-draft requires policy.cmsRole naming the CMS role' });
      continue;
    }
    if (!manifest.policy.cmsRoleAssertedBy) {
      violations.push({
        rule: 'R9',
        agent: dir,
        message: 'cms-draft requires policy.cmsRoleAssertedBy naming the access-assertion test in the site repo',
      });
      continue;
    }
    if (!existsSync(path.join(root, manifest.policy.cmsRoleAssertedBy))) {
      violations.push({
        rule: 'R9',
        agent: dir,
        message: `named assertion test "${manifest.policy.cmsRoleAssertedBy}" does not exist — the access rules are no longer asserted`,
      });
    }
  }
  return violations;
};

/**
 * R10 — no agent may declare a direct database connection. Any agent, any
 * tag: the rule most likely to be broken by someone being helpful during a
 * debugging session. Two layers: connections classified `database` in
 * connections.yaml are refused, and connection names that look like databases
 * are refused even if someone "helpfully" registers them.
 */
export const r10: Rule = ({ manifests, connections }) => {
  const violations: Violation[] = [];
  const dbLike = /postgres|postgresql|mysql|mariadb|sqlite|mongo|redis|database|\bdb\b/i;
  for (const { dir, manifest } of manifests) {
    if (!manifest?.policy) continue;
    for (const conn of manifest.policy.connections ?? []) {
      const kind = connections.connections?.[conn]?.kind;
      if (kind === 'database') {
        violations.push({
          rule: 'R10',
          agent: dir,
          message: `connection "${conn}" is classified database — no agent holds a direct database credential`,
        });
      } else if (dbLike.test(conn)) {
        violations.push({
          rule: 'R10',
          agent: dir,
          message: `connection "${conn}" looks like a database — if it is one, it is prohibited; if not, rename it`,
        });
      }
    }
  }
  return violations;
};

/** Connection kinds whose figures carry sample sizes — a read-emitting agent must declare a threshold for each it consumes. */
const N_THRESHOLD_KINDS = new Set(['analytics', 'search', 'seo', 'email']);

/**
 * R11 — any agent emitting a `read` artifact declares content.nThreshold per
 * connected source. The schema half (read.schema.json rejecting
 * empty-by-omission alternativeExplanations and couldNotDetermine) already
 * enforces required honesty fields; this is the manifest half.
 */
export const r11: Rule = ({ manifests, connections }) => {
  const violations: Violation[] = [];
  for (const { dir, manifest } of manifests) {
    if (!manifest?.policy) continue;
    const emitsRead = (manifest.content?.emits ?? []).includes('read');
    if (!emitsRead) continue;

    const thresholds = manifest.content?.nThreshold ?? {};
    const needing = (manifest.policy.connections ?? []).filter((c) =>
      N_THRESHOLD_KINDS.has(connections.connections?.[c]?.kind ?? ''),
    );
    if (!needing.length && !Object.keys(thresholds).length) {
      violations.push({
        rule: 'R11',
        agent: dir,
        message: 'emits read but declares no nThreshold and no measurable source — a read with no data source is a story generator',
      });
    }
    for (const source of needing) {
      if (!(source in thresholds)) {
        violations.push({
          rule: 'R11',
          agent: dir,
          message: `emits read from "${source}" without content.nThreshold.${source} — below-n directional claims would be unblockable`,
        });
      }
    }
  }
  return violations;
};

/**
 * R12 — any decision class at review level ≥ 3 references a calibration
 * record with n above threshold and zero severe misses in window. Applies to
 * agent-judgement classes; deterministic-check classes sit at 4 because
 * their oracle is the check itself. Violations attach to the register, not
 * to one agent — the ladder is a property of the practice.
 */
export const r12: Rule = ({ root }) => {
  const classesFile = path.join(root, '.agency', 'calibration', 'decision-classes.yaml');
  if (!existsSync(classesFile)) return [];
  const violations: Violation[] = [];
  for (const cls of loadClasses(root)) {
    const verdict = qualifiesForLevel(root, cls);
    if (!verdict.ok) {
      violations.push({ rule: 'R12', agent: `class:${cls.id}`, message: verdict.reason });
    }
    if (cls.basis === 'never' && cls.level > 0) {
      violations.push({ rule: 'R12', agent: `class:${cls.id}`, message: 'a never-graduating class has been raised above level 0' });
    }
    if (cls.level > cls.ceiling) {
      violations.push({ rule: 'R12', agent: `class:${cls.id}`, message: `level ${cls.level} exceeds ceiling ${cls.ceiling}` });
    }
  }
  return violations;
};

export const extraRules: Rule[] = [r9, r10, r11, r12];
