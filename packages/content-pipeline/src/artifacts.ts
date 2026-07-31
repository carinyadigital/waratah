/**
 * Loading and locating .agency/content/ artifacts and packages/brand/dist.
 * The slug is the join key across tracker, artifacts and CMS (design.md §4).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { BrandDist, BriefArtifact, DraftArtifact, PackArtifact } from './gates/types';

export interface RepoPaths {
  root: string;
  content: string;
  brandDist: string;
}

export const repoPaths = (root: string): RepoPaths => ({
  root,
  content: path.join(root, '.agency', 'content'),
  brandDist: path.join(root, 'packages', 'brand', 'dist'),
});

const readYaml = <T>(file: string): T => parseYaml(readFileSync(file, 'utf8')) as T;
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

export const loadBrand = (paths: RepoPaths): BrandDist => {
  const dist = paths.brandDist;
  if (!existsSync(path.join(dist, 'positioning.json'))) {
    throw new Error('packages/brand/dist missing — run `pnpm build:brand` first');
  }
  return {
    positioning: readJson(path.join(dist, 'positioning.json')),
    claimPolicy: readJson(path.join(dist, 'claim-policy.json')),
    bannedWords: readJson(path.join(dist, 'banned-words.json')),
    surfaces: readJson(path.join(dist, 'surfaces.json')),
  };
};

export const listBriefSlugs = (paths: RepoPaths): string[] => {
  const dir = path.join(paths.content, 'briefs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => f.replace(/\.ya?ml$/, ''));
};

export const loadBrief = (paths: RepoPaths, slug: string): BriefArtifact =>
  readYaml(path.join(paths.content, 'briefs', `${slug}.yaml`));

export const loadPack = (paths: RepoPaths, slug: string): PackArtifact =>
  readYaml(path.join(paths.content, 'packs', `${slug}.yaml`));

export const hasDraft = (paths: RepoPaths, slug: string): boolean =>
  existsSync(path.join(paths.content, 'drafts', `${slug}.json`));

export const loadDraft = (paths: RepoPaths, slug: string): DraftArtifact =>
  readJson(path.join(paths.content, 'drafts', `${slug}.json`));

export const corpusSlugs = (paths: RepoPaths): string[] => {
  const dir = path.join(paths.content, 'drafts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
};
