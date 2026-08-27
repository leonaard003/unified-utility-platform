import { spawn } from 'node:child_process';
import { AppError } from './errors';
import { SUBPROCESS_TIMEOUT_MS } from './limits';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a binary and collect its output. Never uses a shell, so user-supplied
 * strings (URLs, filenames) can't be interpreted as shell syntax.
 */
export function run(
  bin: string,
  args: string[],
  options: { timeoutMs?: number; maxOutputBytes?: number } = {},
): Promise<RunResult> {
  const timeoutMs = options.timeoutMs ?? SUBPROCESS_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? 8 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new AppError('TIMEOUT', `${bin} took longer than ${Math.round(timeoutMs / 1000)}s and was stopped.`, {
          hint: 'Try a smaller file or a shorter clip.',
        }),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < maxOutputBytes) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < maxOutputBytes) stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new AppError('DEPENDENCY_MISSING', `Could not start "${bin}".`, {
          hint: `${err.message}. Confirm the binary is installed and on PATH.`,
        }),
      );
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** Same as `run`, but throws an AppError when the process exits non-zero. */
export async function runOrThrow(
  bin: string,
  args: string[],
  onFailure: (result: RunResult) => AppError,
  options?: { timeoutMs?: number },
): Promise<RunResult> {
  const result = await run(bin, args, options);
  if (result.code !== 0) throw onFailure(result);
  return result;
}
