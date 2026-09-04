import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

import { compileGraph } from '../harness/compile-graph.js';
import type {
  CompiledAgent,
  ManifestAgent,
  ManifestFileRef,
  WaratahManifest,
} from '../shared/contracts.js';
import {
  discoverAgent,
  scheduleNames,
  type DiscoverAgentOptions,
  type DiscoveredAgent,
  type DiscoveredFile,
} from '../discover/discover-agent.js';
import { CompilerError } from '../discover/diagnostics.js';
import { writeManifest } from './write-manifest.js';

export interface CompileAgentOptions extends DiscoverAgentOptions {
  readonly generatedAt?: Date;
  readonly manifestPath?: string;
}

/**
 * Validates and compiles an authored graph before atomically replacing its manifest.
 *
 * @throws {CompilerError} When discovery finds one or more authored-graph problems.
 */
export async function compileAgent(options: CompileAgentOptions): Promise<CompiledAgent> {
  const discovery = await discoverAgent(options);
  if (discovery.diagnostics.length > 0 || discovery.rootAgent === undefined) {
    throw new CompilerError(discovery.diagnostics);
  }

  const manifest: WaratahManifest = {
    schemaVersion: 1,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    agent: compileDefinition(discovery.rootAgent),
  };
  const destination =
    options.manifestPath ?? join(resolve(options.projectRoot), '.waratah', 'manifest.json');
  await writeManifest(manifest, destination);
  return {
    definition: options.definition,
    manifest,
    graph: compileGraph(options.definition),
  };
}

function compileDefinition(agent: DiscoveredAgent): ManifestAgent {
  return {
    name: agent.definition.name,
    kind: agent.definition.kind,
    model: agent.definition.model,
    instructions: compileFiles(agent.instructions),
    skills: compileFiles(agent.skills),
    memory: compileFiles(agent.memory),
    tools: sortedNames(agent.definition.tools),
    channels: sortedNames(agent.definition.channels),
    schedules: [...scheduleNames(agent.schedules)],
    subagents: agent.subagents.map(compileDefinition),
  };
}

function compileFiles(files: readonly DiscoveredFile[]): readonly ManifestFileRef[] {
  return files.map(({ path, content }) => ({
    path,
    hash: createHash('sha256').update(content).digest('hex'),
  }));
}

function sortedNames(definitions: readonly { readonly name: string }[]): readonly string[] {
  return definitions
    .map(({ name }) => name)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
