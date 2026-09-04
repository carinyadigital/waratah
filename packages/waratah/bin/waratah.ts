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
  waratah serve [directory] [--port <port>]

Commands:
  build  Compile agent/agent.ts to .waratah/manifest.json
  info   Report the graph in an existing .waratah/manifest.json
  serve  Accept POST /session on the local loopback interface

Options:
  -h, --help         Show this usage information
  -p, --port <port>  Listening port for serve (default: 3000; use 0 for any free port)
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
    rejectServeOptions(values.port);
    await build(projectRoot);
  } else if (command === 'info') {
    rejectServeOptions(values.port);
    await info(projectRoot);
  } else if (command === 'serve') {
    await serve(projectRoot, parsePort(values.port));
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
        port: { type: 'string', short: 'p' },
      },
    });
  } catch (error) {
    failUsage(error instanceof Error ? error.message : String(error));
  }
}

async function serve(projectRoot: string, port: number): Promise<void> {
  const [{ createSqliteCheckpointer }, { CreateSessionService }, { createWaratahServer }] =
    await Promise.all([
      import('../src/session/checkpointer.js'),
      import('../src/session/create-session.js'),
      import('../src/protocol/server.js'),
    ]);

  let checkpointer;
  try {
    checkpointer = createSqliteCheckpointer(projectRoot);
  } catch (error) {
    fail(error);
  }

  const server = createWaratahServer({
    sessions: new CreateSessionService(checkpointer, { projectRoot }),
  });

  try {
    const address = await server.listen(port);
    process.stdout.write(
      `${JSON.stringify({ status: 'listening', host: address.host, port: address.port })}\n`,
    );
  } catch (error) {
    if (isAddressInUse(error)) {
      throw new Error(
        `Port ${port} is already in use on 127.0.0.1. Choose another port with --port.`,
      );
    }
    throw error;
  }

  await new Promise<void>((resolveShutdown, rejectShutdown) => {
    let shuttingDown = false;
    const shutdown = (signal: 'SIGINT' | 'SIGTERM'): void => {
      if (shuttingDown) {
        process.exit(signal === 'SIGINT' ? 130 : 143);
        return;
      }
      shuttingDown = true;
      void server
        .close()
        .then(() => {
          removeSignalHandlers();
          resolveShutdown();
        })
        .catch((error: unknown) => {
          removeSignalHandlers();
          rejectShutdown(error);
        });
    };
    const onSigint = (): void => shutdown('SIGINT');
    const onSigterm = (): void => shutdown('SIGTERM');
    const removeSignalHandlers = (): void => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    };
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
  });
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
  process.stdout.write(`${indent}  Schedules: ${formatNames(agent.schedules ?? [])}\n`);
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

function parsePort(value: string | undefined): number {
  if (value !== undefined && !/^\d+$/.test(value)) {
    failUsage('--port must be a decimal integer from 0 to 65535.');
  }
  const port = value === undefined ? 3000 : Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    failUsage('--port must be a decimal integer from 0 to 65535.');
  }
  return port;
}

function rejectServeOptions(port: string | undefined): void {
  if (port !== undefined) {
    failUsage('--port can only be used with waratah serve.');
  }
}

function isAddressInUse(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'EADDRINUSE'
  );
}
