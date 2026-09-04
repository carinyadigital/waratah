import { describe, expect, it } from 'vitest';

import {
  applyMemoryBudget,
  collectBoundedEntries,
  MAX_MEMORY_BYTES,
  MAX_MEMORY_LINES,
} from './load.js';

const marker = '[waratah: MEMORY.md truncated to 200 lines / 25 KB]';

describe('applyMemoryBudget', () => {
  it('uses the decimal 25 KB byte limit', () => {
    expect(MAX_MEMORY_BYTES).toBe(25_000);
  });

  it('preserves content at the 200-line limit', () => {
    const content = lines(MAX_MEMORY_LINES);

    expect(applyMemoryBudget(content)).toEqual({ content, truncated: false });
  });

  it('visibly truncates content one line over the limit', () => {
    const result = applyMemoryBudget(lines(MAX_MEMORY_LINES + 1));

    expect(result.truncated).toBe(true);
    expect(result.content.split('\n')).toHaveLength(MAX_MEMORY_LINES);
    expect(result.content.endsWith(marker)).toBe(true);
  });

  it('bounds content well over the line limit', () => {
    const result = applyMemoryBudget(lines(10_000));

    expect(result.truncated).toBe(true);
    expect(result.content.split('\n')).toHaveLength(MAX_MEMORY_LINES);
    expect(Buffer.byteLength(result.content, 'utf8')).toBeLessThanOrEqual(MAX_MEMORY_BYTES);
  });

  it('preserves multibyte content at the UTF-8 byte limit', () => {
    const content = 'é'.repeat(MAX_MEMORY_BYTES / 2);

    expect(Buffer.byteLength(content, 'utf8')).toBe(MAX_MEMORY_BYTES);
    expect(applyMemoryBudget(content)).toEqual({ content, truncated: false });
  });

  it('visibly truncates content at exactly one byte over the limit', () => {
    const result = applyMemoryBudget(`${'x'.repeat(24_999)}é`);

    expect(Buffer.byteLength(`${'x'.repeat(24_999)}é`, 'utf8')).toBe(25_001);
    expect(result.truncated).toBe(true);
    expect(result.content.endsWith(marker)).toBe(true);
    expect(Buffer.byteLength(result.content, 'utf8')).toBeLessThanOrEqual(25_000);
  });

  it('visibly truncates multibyte content one character over the byte limit', () => {
    const result = applyMemoryBudget('é'.repeat(MAX_MEMORY_BYTES / 2 + 1));

    expect(result.truncated).toBe(true);
    expect(result.content.endsWith(marker)).toBe(true);
    expect(result.content).not.toContain('\uFFFD');
    expect(Buffer.byteLength(result.content, 'utf8')).toBeLessThanOrEqual(MAX_MEMORY_BYTES);
  });

  it('bounds multibyte content well over the byte limit', () => {
    const result = applyMemoryBudget('界'.repeat(MAX_MEMORY_BYTES));

    expect(result.truncated).toBe(true);
    expect(result.content.endsWith(marker)).toBe(true);
    expect(result.content).not.toContain('\uFFFD');
    expect(Buffer.byteLength(result.content, 'utf8')).toBeLessThanOrEqual(MAX_MEMORY_BYTES);
  });
});

describe('collectBoundedEntries', () => {
  it('accepts exactly the remaining entry budget', async () => {
    let enumerated = 0;

    await expect(
      collectBoundedEntries(
        entries(10_000, () => enumerated++),
        10_000,
      ),
    ).resolves.toHaveLength(10_000);
    expect(enumerated).toBe(10_000);
  });

  it('stops enumeration one entry over the remaining budget', async () => {
    let enumerated = 0;

    await expect(
      collectBoundedEntries(
        entries(20_000, () => enumerated++),
        10_000,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_AGENT' });
    expect(enumerated).toBe(10_001);
  });
});

function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');
}

async function* entries(count: number, onEntry: () => void) {
  for (let index = 0; index < count; index += 1) {
    onEntry();
    yield { name: `entry-${index}` };
  }
}
