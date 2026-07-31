/**
 * Gate result rendering — terminal table and the PR-comment markdown used by
 * content-qa. The couldNotVerify list appears in full: what the researcher
 * could not source is exactly what the reviewer must read.
 */
import type { SuiteResult } from './gates/index';

const icon = { pass: '✅', fail: '❌', skip: '⏭️' } as const;

export const renderTable = (suite: SuiteResult): string => {
  const lines: string[] = [`gates: ${suite.slug} — ${suite.ok ? 'PASS' : 'FAIL'}`];
  for (const r of suite.results) {
    lines.push(`  ${icon[r.status]} ${r.gate}`);
    for (const f of r.failures) lines.push(`      - ${f}`);
    for (const n of r.notes ?? []) lines.push(`      · ${n}`);
  }
  if (suite.couldNotVerify.length) {
    lines.push('  couldNotVerify:');
    for (const c of suite.couldNotVerify) lines.push(`      - ${c.claim} — ${c.note}`);
  }
  return lines.join('\n');
};

export const COMMENT_MARKER = '<!-- content-qa-report -->';

export const renderMarkdown = (suites: SuiteResult[]): string => {
  const lines: string[] = [COMMENT_MARKER, '## Content QA', ''];
  for (const suite of suites) {
    lines.push(`### \`${suite.slug}\` — ${suite.ok ? '✅ all gates pass' : '❌ failing'}`, '');
    lines.push('| Gate | Status | Detail |', '|---|---|---|');
    for (const r of suite.results) {
      const detail = [...r.failures, ...(r.notes ?? [])].join('<br>') || '—';
      lines.push(`| ${r.gate} | ${icon[r.status]} ${r.status} | ${detail} |`);
    }
    lines.push('');
    if (suite.couldNotVerify.length) {
      lines.push('**couldNotVerify** — read this before approving:', '');
      for (const c of suite.couldNotVerify) lines.push(`- ${c.claim} — _${c.note}_`);
      lines.push('');
    }
  }
  return lines.join('\n');
};
