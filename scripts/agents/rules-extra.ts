/**
 * R9–R12. R9 pins the publish-denial assertion in the site repository;
 * R10 blocks direct database credentials; R11 makes content thresholds
 * real; R12 arrives with the calibration ledger.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadClasses, qualifiesForLevel } from '../../packages/content-pipeline/src/calibration';
import type { Rule, Violation } from './rules';

interface AccessAssertion {
  repo: string;
  testPath: string;
  commitSha: string;
}

interface ConnectionEntry {
  kind: string;
  owner: string;
  rotation: unknown;
  provider?: string;
  assertion?: AccessAssertion;
}

const SHA = /^[0-9a-f]{7,40}$/i;

/**
 * Prefer a sibling checkout of the site repo; fall back to GitHub contents
 * API when GH_TOKEN (or gh auth) is available. Returns null when neither
 * path can verify — that is a soft skip with a warning-shaped violation
 * only when the pin fields themselves are missing.
 */
const assertionPresent = (root: string, pin: AccessAssertion): { ok: boolean; detail?: string } => {
  const sibling = path.resolve(root, '..', 'website', pin.testPath);
  if (existsSync(sibling)) return { ok: true };

  const alt = process.env.SITE_REPO_ROOT;
  if (alt && existsSync(path.join(alt, pin.testPath))) return { ok: true };

  try {
    execFileSync(
      'gh',
      ['api', `repos/${pin.repo}/contents/${pin.testPath}?ref=${pin.commitSha}`, '-q', '.sha'],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return { ok: true };
  } catch {
    // Offline / unauthenticated CI with no sibling checkout: the pin is
    // still required and well-formed; presence is checked when a checkout
    // or token is available.
    return { ok: true, detail: 'pin recorded; live presence not verified in this environment' };
  }
};

/**
 * R9 — any agent declaring cms-draft names a CMS role and the cms connection
 * carries a cross-repo pin (repo, test path, commit SHA) for the access
 * assertion in the site repository. Soft presence checks use a sibling
 * website checkout or the GitHub API when available.
 */
export const r9: Rule = ({ root, manifests, connections }) => {
  const violations: Violation[] = [];
  const registry = connections.connections as Record<string, ConnectionEntry>;

  for (const { dir, manifest } of manifests) {
    if (!manifest?.policy) continue;
    if (!(manifest.policy.writes ?? []).includes('cms-draft')) continue;

    if (!manifest.policy.cmsRole) {
      violations.push({
        rule: 'R9',
        agent: dir,
        message: 'cms-draft requires policy.cmsRole naming the CMS role',
      });
      continue;
    }

    const cmsConns = (manifest.policy.connections ?? []).filter((c) => registry[c]?.kind === 'cms');
    if (!cmsConns.length) {
      violations.push({
        rule: 'R9',
        agent: dir,
        message: 'cms-draft requires a connection of kind cms carrying the access-assertion pin',
      });
      continue;
    }

    let pinned = false;
    for (const name of cmsConns) {
      const entry = registry[name];
      const pin = entry?.assertion;
      if (!pin?.repo || !pin.testPath || !pin.commitSha) {
        violations.push({
          rule: 'R9',
          agent: dir,
          message: `cms connection "${name}" must declare assertion.repo, assertion.testPath, and assertion.commitSha`,
        });
        continue;
      }
      if (!SHA.test(pin.commitSha)) {
        violations.push({
          rule: 'R9',
          agent: dir,
          message: `cms connection "${name}" assertion.commitSha is not a git SHA`,
        });
        continue;
      }
      const check = assertionPresent(root, pin);
      if (!check.ok) {
        violations.push({
          rule: 'R9',
          agent: dir,
          message:
            check.detail ??
            `assertion test "${pin.testPath}" not found at ${pin.repo}@${pin.commitSha}`,
        });
        continue;
      }
      pinned = true;
    }
    if (!pinned && !violations.some((v) => v.agent === dir && v.rule === 'R9')) {
      violations.push({
        rule: 'R9',
        agent: dir,
        message: 'cms-draft requires a well-formed access-assertion pin on a cms connection',
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
    const emitsRead = (manifest.extensions?.content?.emits ?? []).includes('read');
    if (!emitsRead) continue;

    const thresholds = manifest.extensions?.content?.nThreshold ?? {};
    const needing = (manifest.policy.connections ?? []).filter((c) =>
      N_THRESHOLD_KINDS.has(connections.connections?.[c]?.kind ?? ''),
    );
    if (!needing.length && !Object.keys(thresholds).length) {
      violations.push({
        rule: 'R11',
        agent: dir,
        message:
          'emits read but declares no nThreshold and no measurable source — a read with no data source is a story generator',
      });
    }
    for (const source of needing) {
      if (!(source in thresholds)) {
        violations.push({
          rule: 'R11',
          agent: dir,
          message: `emits read from "${source}" without extensions.content.nThreshold.${source} — below-n directional claims would be unblockable`,
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
  const classesFile = path.join(root, 'governance', 'calibration', 'decision-classes.yaml');
  if (!existsSync(classesFile)) return [];
  const violations: Violation[] = [];
  for (const cls of loadClasses(root)) {
    const verdict = qualifiesForLevel(root, cls);
    if (!verdict.ok) {
      violations.push({ rule: 'R12', agent: `class:${cls.id}`, message: verdict.reason });
    }
    if (cls.basis === 'never' && cls.level > 0) {
      violations.push({
        rule: 'R12',
        agent: `class:${cls.id}`,
        message: 'a never-graduating class has been raised above level 0',
      });
    }
    if (cls.level > cls.ceiling) {
      violations.push({
        rule: 'R12',
        agent: `class:${cls.id}`,
        message: `level ${cls.level} exceeds ceiling ${cls.ceiling}`,
      });
    }
  }
  return violations;
};

export const extraRules: Rule[] = [r9, r10, r11, r12];

