/**
 * Policy rules, CI-enforced by `pnpm agents check`.
 * A rule that cannot be checked is documentation, and is marked as such.
 * R1–R8 land with the register; R9–R12 are added as later epics deliver them.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  CONSEQUENTIAL_WRITES,
  validateManifest,
  type ConnectionRegistry,
  type LoadedManifest,
} from '../../packages/agent-manifest/src/index';

export interface RuleContext {
  root: string;
  manifests: LoadedManifest[];
  connections: ConnectionRegistry;
}

export interface Violation {
  rule: string;
  agent: string;
  message: string;
}

export type Rule = (ctx: RuleContext) => Violation[];

/** R1 — every agents/<dir> has a schema-valid agent.yaml whose name matches its directory. */
export const r1: Rule = ({ manifests }) => {
  const violations: Violation[] = [];
  for (const { dir, manifest } of manifests) {
    if (!manifest) {
      violations.push({ rule: 'R1', agent: dir, message: 'missing agent.yaml' });
      continue;
    }
    if (!validateManifest(manifest)) {
      for (const err of validateManifest.errors ?? []) {
        violations.push({ rule: 'R1', agent: dir, message: `${err.instancePath || '/'} ${err.message}` });
      }
    }
    if (manifest.name && manifest.name !== dir) {
      violations.push({ rule: 'R1', agent: dir, message: `name "${manifest.name}" does not match directory "${dir}"` });
    }
  }
  return violations;
};

/** R2 — every declared connection exists in connections.yaml with an owner and rotation policy. */
export const r2: Rule = ({ manifests, connections }) => {
  const violations: Violation[] = [];
  for (const { dir, manifest } of manifests) {
    if (!manifest?.policy) continue;
    for (const conn of manifest.policy.connections ?? []) {
      const entry = connections.connections?.[conn];
      if (!entry) violations.push({ rule: 'R2', agent: dir, message: `connection "${conn}" is not registered in config/connections.yaml` });
      else if (!entry.owner || !entry.rotation)
        violations.push({ rule: 'R2', agent: dir, message: `connection "${conn}" lacks an owner or rotation policy` });
    }
  }
  return violations;
};

/** R3 — untrustedInput: true may not pair with approval: none. */
export const r3: Rule = ({ manifests }) => {
  const violations: Violation[] = [];
  for (const { dir, manifest } of manifests) {
    if (!manifest?.policy) continue;
    if (manifest.policy.untrustedInput === true && manifest.policy.approval === 'none') {
      violations.push({ rule: 'R3', agent: dir, message: 'untrustedInput: true may not pair with approval: none' });
    }
  }
  return violations;
};

/** R4 — any consequential write requires approval: human or pr-review. R4′ — a content agent may declare cms-draft, never cms-publish. */
export const r4: Rule = ({ manifests }) => {
  const violations: Violation[] = [];
  for (const { dir, manifest } of manifests) {
    if (!manifest?.policy) continue;
    const writes = manifest.policy.writes ?? [];
    const consequential = writes.filter((w) => CONSEQUENTIAL_WRITES.includes(w));
    if (consequential.length && !['human', 'pr-review'].includes(manifest.policy.approval)) {
      violations.push({
        rule: 'R4',
        agent: dir,
        message: `consequential write(s) ${consequential.join(', ')} require approval human or pr-review (found "${manifest.policy.approval}")`,
      });
    }
    if ((manifest.tags ?? []).includes('content') && writes.includes('cms-publish')) {
      violations.push({ rule: "R4'", agent: dir, message: 'a content agent may never declare cms-publish' });
    }
  }
  return violations;
};

/** R5 — any agent with a schedule trigger declares spendCapUsd. github-actions agents are exempt: no model calls, no spend. */
export const r5: Rule = ({ manifests }) => {
  const violations: Violation[] = [];
  for (const { dir, manifest } of manifests) {
    if (!manifest) continue;
    const scheduled = (manifest.triggers ?? []).some((t) => t.type === 'schedule');
    const modelPlatform = manifest.deploy?.platform !== 'github-actions';
    if (scheduled && modelPlatform && !manifest.policy?.spendCapUsd) {
      violations.push({ rule: 'R5', agent: dir, message: 'schedule trigger requires policy.spendCapUsd' });
    }
  }
  return violations;
};

/** R6 — every agent declares an owner and observability.alertChannel. */
export const r6: Rule = ({ manifests }) => {
  const violations: Violation[] = [];
  for (const { dir, manifest } of manifests) {
    if (!manifest) continue;
    if (!manifest.owner) violations.push({ rule: 'R6', agent: dir, message: 'missing owner' });
    if (!manifest.observability?.alertChannel)
      violations.push({ rule: 'R6', agent: dir, message: 'missing observability.alertChannel' });
  }
  return violations;
};

/** R7 — any unattended writer declares idempotencyKey. Unattended = triggered by schedule, repo-event or webhook; writer = any declared write. */
export const r7: Rule = ({ manifests }) => {
  const violations: Violation[] = [];
  for (const { dir, manifest } of manifests) {
    if (!manifest?.policy) continue;
    const unattended = (manifest.triggers ?? []).some((t) => ['schedule', 'repo-event', 'webhook'].includes(t.type));
    if (unattended && (manifest.policy.writes ?? []).length && !manifest.policy.idempotencyKey) {
      violations.push({ rule: 'R7', agent: dir, message: 'unattended writer requires policy.idempotencyKey' });
    }
  }
  return violations;
};

/** R8 — brand assets are referenced by dist/ path, never duplicated into an agent. */
export const r8: Rule = ({ root, manifests }) => {
  const violations: Violation[] = [];
  for (const { dir, manifest } of manifests) {
    const content = manifest?.content;
    if (!content) continue;
    for (const key of ['voice', 'rubric', 'positioning'] as const) {
      const ref = content[key];
      if (!ref) continue;
      if (!ref.startsWith('packages/brand/dist/')) {
        violations.push({ rule: 'R8', agent: dir, message: `content.${key} must reference packages/brand/dist/, found "${ref}"` });
      }
    }
    // The duplication half: no brand source files copied under the agent dir.
    for (const banned of ['positioning.md', 'voice.md', 'claim-policy.md', 'editorial-rubric.md', 'banned-words.json']) {
      if (existsSync(path.join(root, 'agents', dir, banned))) {
        violations.push({ rule: 'R8', agent: dir, message: `brand asset "${banned}" duplicated into the agent directory` });
      }
    }
  }
  return violations;
};

export const coreRules: Rule[] = [r1, r2, r3, r4, r5, r6, r7, r8];
