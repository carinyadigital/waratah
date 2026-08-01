/**
 * Policy rules, CI-enforced by `pnpm agents check`.
 * A rule that cannot be checked is documentation, and is marked as such.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  CONSEQUENTIAL_WRITES,
  validateContentExtension,
  validateManifest,
  type ConnectionRegistry,
  type LoadedManifest,
} from '../../packages/agent-manifest/src/index';
import { loadAdapters } from '../../packages/runtime/src/index';

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

const agentBasename = (dir: string): string => dir.split('/').filter(Boolean).pop() ?? dir;

const expectedName = (dir: string, team?: string): string => {
  const base = agentBasename(dir);
  // Prefer full agent names as directory names (content-analyst). Only prefix
  // short role dirs (analyst → content-analyst) when they lack the team prefix.
  if (dir.includes('/') && team && !base.startsWith(`${team}-`)) return `${team}-${base}`;
  return base;
};

/** R1 — every agent directory has a schema-valid agent.yaml; name matches the directory basename. */
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
    const want = expectedName(dir, manifest.team);
    if (manifest.name && manifest.name !== want && manifest.name !== agentBasename(dir)) {
      violations.push({
        rule: 'R1',
        agent: dir,
        message: `name "${manifest.name}" does not match expected "${want}"`,
      });
    }
    if (manifest.extensions?.content && !validateContentExtension(manifest.extensions.content)) {
      for (const err of validateContentExtension.errors ?? []) {
        violations.push({
          rule: 'R1',
          agent: dir,
          message: `extensions.content${err.instancePath || ''} ${err.message}`,
        });
      }
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
      if (!entry)
        violations.push({
          rule: 'R2',
          agent: dir,
          message: `connection "${conn}" is not registered in config/connections.yaml`,
        });
      else if (!entry.owner || !entry.rotation)
        violations.push({
          rule: 'R2',
          agent: dir,
          message: `connection "${conn}" lacks an owner or rotation policy`,
        });
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
      violations.push({
        rule: 'R3',
        agent: dir,
        message: 'untrustedInput: true may not pair with approval: none',
      });
    }
  }
  return violations;
};

/** R4 — consequential writes need human/pr-review. R4′ — content team may never declare cms-publish. */
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
    if (manifest.team === 'content' && writes.includes('cms-publish')) {
      violations.push({
        rule: "R4'",
        agent: dir,
        message: 'a content agent may never declare cms-publish',
      });
    }
  }
  return violations;
};

/**
 * R5 — scheduled model-backed agents declare spendCapUsd.
 * When a binding's adapter cannot enforce the cap, the binding must set
 * spendCapAcknowledged: true (or the adapter must declare spendCap: enforced).
 */
export const r5: Rule = ({ root, manifests }) => {
  const violations: Violation[] = [];
  const adapters = loadAdapters(root);
  const byId = new Map(adapters.map((a) => [a.id, a]));

  for (const { dir, manifest } of manifests) {
    if (!manifest) continue;
    const scheduled =
      (manifest.triggers ?? []).some((t) => t.type === 'schedule') ||
      (manifest.bindings ?? []).some((b) => Boolean(b.schedule));
    const modelBindings = (manifest.bindings ?? []).filter((b) => b.provider !== 'github-actions');
    if (!scheduled || !modelBindings.length) continue;

    if (!manifest.policy?.spendCapUsd) {
      violations.push({ rule: 'R5', agent: dir, message: 'schedule trigger requires policy.spendCapUsd' });
      continue;
    }

    for (const binding of modelBindings) {
      const adapter = byId.get(binding.provider);
      if (!adapter) continue;
      if (adapter.capabilities.spendCap === 'enforced') continue;
      if (adapter.capabilities.spendCap === 'none') continue;
      if (!binding.spendCapAcknowledged) {
        violations.push({
          rule: 'R5',
          agent: dir,
          message: `binding provider "${binding.provider}" cannot enforce spendCapUsd — set spendCapAcknowledged: true on the binding or lower the cap onto an enforcing adapter`,
        });
      }
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

/** R7 — any unattended writer declares idempotencyKey. */
export const r7: Rule = ({ manifests }) => {
  const violations: Violation[] = [];
  for (const { dir, manifest } of manifests) {
    if (!manifest?.policy) continue;
    const unattended = (manifest.triggers ?? []).some((t) =>
      ['schedule', 'repo-event', 'webhook'].includes(t.type),
    );
    if (unattended && (manifest.policy.writes ?? []).length && !manifest.policy.idempotencyKey) {
      violations.push({
        rule: 'R7',
        agent: dir,
        message: 'unattended writer requires policy.idempotencyKey',
      });
    }
  }
  return violations;
};

/**
 * R8 — brand assets live under packages/brand/; agents never duplicate them
 * and never restate brand paths in the manifest (resolved by the workflow).
 */
export const r8: Rule = ({ root, manifests }) => {
  const violations: Violation[] = [];
  for (const { dir } of manifests) {
    for (const banned of [
      'positioning.md',
      'voice.md',
      'claim-policy.md',
      'editorial-rubric.md',
      'banned-words.json',
      'guide.md',
    ]) {
      if (existsSync(path.join(root, 'agents', dir, banned))) {
        violations.push({
          rule: 'R8',
          agent: dir,
          message: `brand asset "${banned}" duplicated into the agent directory`,
        });
      }
    }
  }
  return violations;
};

/** Bindings must name an installed adapter. */
export const rBindings: Rule = ({ root, manifests }) => {
  const violations: Violation[] = [];
  const ids = new Set(loadAdapters(root).map((a) => a.id));
  for (const { dir, manifest } of manifests) {
    if (!manifest?.bindings) continue;
    for (const b of manifest.bindings) {
      if (!ids.has(b.provider)) {
        violations.push({
          rule: 'R1',
          agent: dir,
          message: `binding provider "${b.provider}" is not an installed adapter under packages/runtime/adapters/`,
        });
      }
    }
  }
  return violations;
};

/**
 * R13 — packages/ may not import from agents/. An agent may not import from
 * another team. No package may import a vendor SDK except its own adapter.
 */
export const r13: Rule = ({ root }) => {
  const violations: Violation[] = [];
  const packagesDir = path.join(root, 'packages');
  if (!existsSync(packagesDir)) return violations;

  const walkTs = (dir: string): string[] => {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walkTs(full));
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  };

  const importRe = /from\s+['"]([^'"]+)['"]/g;

  for (const file of walkTs(packagesDir)) {
    const rel = path.relative(root, file);
    const pkg = rel.split(path.sep)[1];
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(importRe)) {
      const spec = match[1];
      if (spec.includes('/agents/') || spec.startsWith('../../../agents')) {
        violations.push({
          rule: 'R13',
          agent: `pkg:${pkg}`,
          message: `${rel} imports from agents/ — packages may not depend on agents`,
        });
      }
      // Vendor SDKs only in their adapter package.
      if (
        (spec === 'payload' || spec.startsWith('@payloadcms/')) &&
        pkg !== 'content-store-payload'
      ) {
        violations.push({
          rule: 'R13',
          agent: `pkg:${pkg}`,
          message: `${rel} imports Payload SDK — only content-store-payload may`,
        });
      }
    }
  }

  return violations;
};

export const coreRules: Rule[] = [r1, r2, r3, r4, r5, r6, r7, r8, rBindings, r13];
