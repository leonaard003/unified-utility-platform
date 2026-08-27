import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TMP_TTL_MS } from './limits';
import { logger } from './logger';

/**
 * Temp-file lifecycle for server-side processing.
 *
 * Every job gets its own directory under the temp root. Jobs clean up after
 * themselves via `withWorkspace`, and a periodic sweeper removes anything that
 * outlived its TTL (covers crashes and killed subprocesses).
 */

export function tempRoot(): string {
  return process.env.UUP_TMP_DIR || path.join(process.cwd(), 'tmp');
}

export interface Workspace {
  dir: string;
  /** Build a path inside the workspace, rejecting any traversal attempt. */
  file(name: string): string;
}

function safeName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-]+/g, '_');
  return base.replace(/^\.+/, '_') || 'file';
}

export async function createWorkspace(prefix = 'job'): Promise<Workspace> {
  const dir = path.join(tempRoot(), `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return {
    dir,
    file(name: string) {
      return path.join(dir, safeName(name));
    },
  };
}

export async function destroyWorkspace(ws: Workspace): Promise<void> {
  await fs.rm(ws.dir, { recursive: true, force: true }).catch((err) => {
    logger.warn('tempfiles.cleanup_failed', { dir: ws.dir, message: String(err) });
  });
}

/** Run `fn` with a scratch directory that is always removed afterwards. */
export async function withWorkspace<T>(prefix: string, fn: (ws: Workspace) => Promise<T>): Promise<T> {
  const ws = await createWorkspace(prefix);
  try {
    return await fn(ws);
  } finally {
    await destroyWorkspace(ws);
  }
}

/** Delete job directories older than the configured TTL. */
export async function sweepExpired(now = Date.now()): Promise<number> {
  const root = tempRoot();
  let removed = 0;
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(root, entry);
    try {
      const stat = await fs.stat(full);
      if (now - stat.mtimeMs > TMP_TTL_MS) {
        await fs.rm(full, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      // Raced with another sweep or a job cleanup — nothing to do.
    }
  }
  if (removed > 0) logger.info('tempfiles.swept', { removed, root });
  return removed;
}

let sweeper: NodeJS.Timeout | null = null;

/** Idempotent: safe to call from every route handler module. */
export function startSweeper(): void {
  if (sweeper) return;
  const interval = Math.max(60_000, Math.floor(TMP_TTL_MS / 3));
  sweeper = setInterval(() => {
    void sweepExpired();
  }, interval);
  // Do not hold the process open just for the sweeper.
  sweeper.unref?.();
  void sweepExpired();
  logger.info('tempfiles.sweeper_started', { root: tempRoot(), intervalMs: interval, ttlMs: TMP_TTL_MS });
}

export function tempInfo() {
  return { root: tempRoot(), ttlMs: TMP_TTL_MS, osTmp: os.tmpdir() };
}
