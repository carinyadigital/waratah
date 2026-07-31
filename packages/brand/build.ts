/**
 * CNT02-03 — builds `dist/` from `src/`. Generated; never hand-edited.
 *
 * Emits:
 *   dist/positioning.json     — content hash of positioning.md (the hash every
 *                               brief and published piece records)
 *   dist/carinya-voice.json   — voice rules for agents
 *   dist/editorial-rubric.md  — copy for pass-3 editing
 *   dist/banned-words.json    — copy for the style-lint gate
 *   dist/claim-policy.json    — machine block parsed out of claim-policy.md
 *   dist/surfaces.json        — per-surface specs parsed from front-matter
 *
 * Agents reference these by dist/ path, never duplicated (R8).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'src');
const dist = path.join(here, 'dist');

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const frontMatter = (raw: string): { data: Record<string, unknown>; body: string } => {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  return { data: parseYaml(m[1]) as Record<string, unknown>, body: m[2] };
};

mkdirSync(path.join(dist, 'surfaces'), { recursive: true });

// positioning.json — the stable hash consumable by agents and gates
const positioningRaw = readFileSync(path.join(src, 'positioning.md'), 'utf8');
const positioning = {
  hash: sha256(positioningRaw),
  source: 'packages/brand/src/positioning.md',
  builtAt: new Date().toISOString(),
};
writeFileSync(path.join(dist, 'positioning.json'), JSON.stringify(positioning, null, 2));

// carinya-voice.json
const voiceRaw = readFileSync(path.join(src, 'voice.md'), 'utf8');
writeFileSync(
  path.join(dist, 'carinya-voice.json'),
  JSON.stringify({ hash: sha256(voiceRaw), source: 'packages/brand/src/voice.md', markdown: voiceRaw }, null, 2),
);

// straight copies
copyFileSync(path.join(src, 'editorial-rubric.md'), path.join(dist, 'editorial-rubric.md'));
copyFileSync(path.join(src, 'banned-words.json'), path.join(dist, 'banned-words.json'));

// claim-policy.json — parse the ```yaml machine block out of claim-policy.md
const claimPolicyRaw = readFileSync(path.join(src, 'claim-policy.md'), 'utf8');
const block = claimPolicyRaw.match(/```yaml\n([\s\S]*?)\n```/);
if (!block) throw new Error('claim-policy.md is missing its machine block');
const claimPolicy = parseYaml(block[1]) as Record<string, unknown>;
writeFileSync(
  path.join(dist, 'claim-policy.json'),
  JSON.stringify({ hash: sha256(claimPolicyRaw), source: 'packages/brand/src/claim-policy.md', ...claimPolicy }, null, 2),
);

// surfaces
const surfaceFiles = readdirSync(path.join(src, 'surfaces')).filter((f) => f.endsWith('.md'));
const surfaces: Record<string, unknown> = {};
for (const f of surfaceFiles) {
  const raw = readFileSync(path.join(src, 'surfaces', f), 'utf8');
  const { data, body } = frontMatter(raw);
  const id = String(data.id ?? path.basename(f, '.md'));
  const spec = { ...data, id, notes: body.trim() };
  surfaces[id] = spec;
  writeFileSync(path.join(dist, 'surfaces', `${id}.json`), JSON.stringify(spec, null, 2));
}
writeFileSync(path.join(dist, 'surfaces.json'), JSON.stringify(surfaces, null, 2));

console.log(`brand built. positioning hash ${positioning.hash.slice(0, 12)}…`);
