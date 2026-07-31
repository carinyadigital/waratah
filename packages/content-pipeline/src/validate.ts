/**
 * Schema validation, applied on write. Required-by-omission fields —
 * couldNotVerify, couldNotDetermine, alternativeExplanations — are rejected
 * when absent because the schemas mark them `required`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const here = path.dirname(fileURLToPath(import.meta.url));

const ajv = new Ajv2020({ allErrors: true, strict: false });
const applyFormats = (addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats;
applyFormats(ajv);

export type SchemaName = 'brief' | 'pack' | 'read' | 'draft' | 'demand' | 'opportunities' | 'review';

const compiled = new Map<SchemaName, ReturnType<typeof ajv.compile>>();

export const getValidator = (name: SchemaName) => {
  let v = compiled.get(name);
  if (!v) {
    const schema = JSON.parse(readFileSync(path.join(here, 'schemas', `${name}.schema.json`), 'utf8'));
    v = ajv.compile(schema);
    compiled.set(name, v);
  }
  return v;
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const validateArtifact = (name: SchemaName, data: unknown): ValidationResult => {
  const validator = getValidator(name);
  const valid = validator(data) as boolean;
  return {
    valid,
    errors: (validator.errors ?? []).map(
      (e) => `${e.instancePath || '/'} ${e.message ?? ''}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`,
    ),
  };
};

/** Validate-or-throw, for use at artifact write time. */
export const assertValid = (name: SchemaName, data: unknown, label?: string): void => {
  const result = validateArtifact(name, data);
  if (!result.valid) {
    throw new Error(`${label ?? name} failed ${name}.schema.json:\n  ${result.errors.join('\n  ')}`);
  }
};
