import type { Document } from '@carinyaparc/content-store';

export interface BriefArtifact {
  slug: string;
  trackerRef: string;
  surface: 'blog' | 'recipes' | 'landing' | 'newsletter';
  targetQuery: string;
  angle: string;
  audience: string;
  mustSupport: { claim: string; evidence?: string }[];
  mustNotClaim: string[];
  internalLinks: string[];
  sourceBudget: number;
  successMetric: string;
  positioningHash: string;
  expiresAt: string;
  linearRef?: string;
  syncedAt?: string;
}

export interface PackEntry {
  id: string;
  claim: string;
  source: string;
  excerpt: string;
  confidence: 'high' | 'medium' | 'low';
  verifiedAt: string;
  mustSupport?: boolean;
}

export interface PackArtifact {
  slug: string;
  entries: PackEntry[];
  couldNotVerify: { claim: string; note: string }[];
}

/** Staged draft artifact. Content is the provider-neutral document model. */
export interface DraftArtifact {
  slug: string;
  title: string;
  surface: 'blog' | 'recipes' | 'landing' | 'newsletter';
  content: Document;
}

export interface ClaimPolicy {
  prohibited: { id: string; pattern: string; reason: string }[];
  categories: { id: string; maxSourceAgeMonths: number; patterns: string[] }[];
}

export interface BannedWords {
  banned: { term: string; reason: string; instead?: string }[];
  perSurface?: Record<string, { term: string; reason: string }[]>;
}

export interface SurfaceSpec {
  id: string;
  readability: { minFlesch: number; maxFlesch: number };
  words: { min: number; max: number };
  decayHalfLifeMonths: number;
  requiresInternalLinks: boolean;
  canonical: boolean;
  notes?: string;
}

export interface BrandDist {
  positioning: { hash: string };
  claimPolicy: ClaimPolicy;
  bannedWords: BannedWords;
  surfaces: Record<string, SurfaceSpec>;
}

export interface GateOptions {
  /** 'check' resolves external links over HTTP; 'skip' marks the external half of the links gate skipped (offline runs). */
  externalLinks?: 'check' | 'skip';
  fetchImpl?: typeof fetch;
  /** Slugs that exist in the corpus (for internal-link resolution beyond the brief). */
  corpusSlugs?: string[];
}

export interface GateInput {
  slug: string;
  draft: DraftArtifact;
  brief: BriefArtifact;
  pack: PackArtifact;
  brand: BrandDist;
  options?: GateOptions;
}

export type GateStatus = 'pass' | 'fail' | 'skip';

export interface GateResult {
  gate: string;
  status: GateStatus;
  failures: string[];
  notes?: string[];
}

export type Gate = (input: GateInput) => Promise<GateResult> | GateResult;
