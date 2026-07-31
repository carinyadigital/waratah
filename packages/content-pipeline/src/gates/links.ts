/**
 * Links. External links resolve; the brief's internalLinks are present in
 * the document.
 */
import { collectLinks } from '../lexical/claim';
import type { Gate, GateResult } from './types';

const isExternal = (url: string) => /^https?:\/\//i.test(url);

/** /posts/<slug>, /recipes/<slug> or /<slug> → slug */
export const internalSlug = (url: string): string | null => {
  const m = url.match(/^\/(?:posts\/|recipes\/)?([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  return m ? m[1] : null;
};

export const links: Gate = async ({ draft, brief, pack, options }): Promise<GateResult> => {
  const failures: string[] = [];
  const notes: string[] = [];
  const found = collectLinks(draft.content);

  // Internal links demanded by the brief must appear.
  const internalSlugs = new Set(found.map((l) => internalSlug(l.url)).filter(Boolean) as string[]);
  for (const slug of brief.internalLinks) {
    if (!internalSlugs.has(slug)) failures.push(`brief internal link "${slug}" is not present in the document`);
  }

  // Internal links must point at known corpus slugs, when a corpus list is supplied.
  if (options?.corpusSlugs) {
    const corpus = new Set(options.corpusSlugs);
    for (const s of internalSlugs) {
      if (!corpus.has(s)) failures.push(`internal link "/${s}" points at no known document`);
    }
  }

  // External links resolve — document links and pack sources alike.
  const externals = [
    ...new Set([...found.map((l) => l.url).filter(isExternal), ...pack.entries.map((e) => e.source)]),
  ];
  if (options?.externalLinks === 'skip') {
    notes.push(`external resolution skipped (${externals.length} link(s)) — offline run`);
  } else {
    const fetchImpl = options?.fetchImpl ?? fetch;
    for (const url of externals) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        let res = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
        if (res.status === 405 || res.status === 501) {
          res = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
        }
        clearTimeout(timer);
        if (res.status >= 400) failures.push(`external link ${url} returned ${res.status}`);
      } catch (err) {
        failures.push(`external link ${url} did not resolve (${(err as Error).message})`);
      }
    }
  }

  return { gate: 'links', status: failures.length ? 'fail' : 'pass', failures, notes };
};
