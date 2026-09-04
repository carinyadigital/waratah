#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { compileAgent } from '../src/compiler/compile-agent.js';
import type { AgentDefinition, WaratahManifest } from '../src/shared/contracts.js';

const USAGE = `Usage:
  waratah build [directory]
  waratah info [directory]

Commands:
  build  Compile agent/agent.ts to .waratah/manifest.json
  info   Report the graph in an existing .waratah/manifest.json

Options:
  -h, --help  Show this usage information
`;

await main().catch(fail);

async function main(): Promise<void> {
  const { positionals, values } = parseCommandLine();

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  const [command, directory, ...extras] = positionals;
  if (command === undefined) {
    failUsage('Missing command.');
  }
  if (extras.length > 0) {
    failUsage(`Unexpected argument ${JSON.stringify(extras[0])}.`);
  }

  const projectRoot = resolve(directory ?? process.cwd());
  if (command === 'build') {
    await build(projectRoot);
  } else if (command === 'info') {
    await info(projectRoot);
  } else {
    failUsage(`Unknown command ${JSON.stringify(command)}.`);
  }
}

function parseCommandLine() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    failUsage(error instanceof Error ? error.message : String(error));
  }
}

async function build(projectRoot: string): Promise<void> {
  const agentFile = resolve(projectRoot, 'agent', 'agent.ts');

  try {
    const authoredModule = await import(pathToFileURL(agentFile).href);
    if (!('default' in authoredModule)) {
      throw new Error(`Agent definition ${agentFile} must have a default export.`);
    }

    const definition = authoredModule.default as AgentDefinition;
    const compiled = await compileAgent({
      definition,
      agentFile,
      projectRoot,
    });
    process.stdout.write(
      `Built ${compiled.manifest.agent.name} at ${resolve(projectRoot, '.waratah', 'manifest.json')}\n`,
    );
  } catch (error) {
    fail(error);
  }
}

async function info(projectRoot: string): Promise<void> {
  const manifestPath = resolve(projectRoot, '.waratah', 'manifest.json');

  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as WaratahManifest;
    if (
      manifest?.schemaVersion !== 1 ||
      typeof manifest?.agent?.name !== 'string' ||
      !Array.isArray(manifest.agent.subagents)
    ) {
      throw new Error(`The manifest at ${manifestPath} is not a valid schemaVersion 1 manifest.`);
    }

    process.stdout.write(`Manifest schema: ${manifest.schemaVersion}\n`);
    printAgent(manifest.agent, 0);
  } catch (error) {
    if (isMissingFile(error)) {
      fail(
        new Error(
          `No compiled manifest exists at ${manifestPath}. Run "waratah build${projectRoot === process.cwd() ? '' : ` ${projectRoot}`}" first.`,
        ),
      );
    }
    fail(error);
  }
}

function printAgent(
  agent: WaratahManifest['agent'],
  depth: number,
): void {
  const indent = '  '.repeat(depth);
  process.stdout.write(
    `${indent}${depth === 0 ? 'Lead' : 'Subagent'}: ${agent.name} (${agent.kind})\n`,
  );
  process.stdout.write(`${indent}  Tools: ${formatNames(agent.tools)}\n`);
  process.stdout.write(`${indent}  Channels: ${formatNames(agent.channels)}\n`);
  for (const subagent of agent.subagents) {
    printAgent(subagent, depth + 1);
  }
}

function formatNames(names: readonly string[]): string {
  return names.length === 0 ? '(none)' : names.join(', ');
}

function failUsage(message?: string): never {
  if (message !== undefined) {
    process.stderr.write(`${message}\n`);
  }
  process.stderr.write(USAGE);
  process.exit(2);
}

function fail(error: unknown): never {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}
