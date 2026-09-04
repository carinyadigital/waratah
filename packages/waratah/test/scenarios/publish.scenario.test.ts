import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const workspaceRoot = resolve(packageRoot, '../..');
const publishedCli = resolve(packageRoot, 'dist/bin/waratah.js');

describe('published waratah package', () => {
  it('emits a Node-runnable CLI into dist', async () => {
    await execFileAsync('pnpm', ['--filter', 'waratah', 'build'], {
      cwd: workspaceRoot,
    });
    await access(publishedCli);

    const { stdout } = await execFileAsync(process.execPath, [publishedCli, '--help'], {
      cwd: workspaceRoot,
    });

    expect(stdout).toContain('waratah build [directory]');
    expect(stdout).toContain('waratah serve [directory]');
  });
});
