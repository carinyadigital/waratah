import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { MemorySaver, type BaseCheckpointSaver } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

import { WaratahError } from '../shared/errors.js';

export type Checkpointer = BaseCheckpointSaver;

export function createMemoryCheckpointer(): Checkpointer {
  return new MemorySaver();
}

export function createSqliteCheckpointer(projectRoot: string): Checkpointer {
  // Resume blob for LangGraph. The inspectable session is `.waratah/session/<id>/`.
  const dbPath = join(resolve(projectRoot), '.waratah', 'sessions.db');
  try {
    mkdirSync(dirname(dbPath), { recursive: true });
    return SqliteSaver.fromConnString(dbPath);
  } catch {
    throw new WaratahError(
      'SESSION_STORE_ERROR',
      'The session store is unavailable. Restore the store before accepting or resuming work.',
    );
  }
}

export async function getThread(
  checkpointer: Checkpointer,
  threadId: string,
): Promise<unknown | undefined> {
  try {
    return await checkpointer.getTuple({ configurable: { thread_id: threadId } });
  } catch {
    throw new WaratahError(
      'SESSION_STORE_ERROR',
      'The session store is unavailable. Restore the store before accepting or resuming work.',
    );
  }
}
