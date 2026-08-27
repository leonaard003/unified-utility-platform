/**
 * Minimal structured logger. Deliberately dependency-free — on a small VPS the
 * output is just captured by systemd/pm2, and structured lines are grep-able.
 */

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, event: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, data?: Record<string, unknown>) => emit('info', event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit('warn', event, data),
  error: (event: string, err: unknown, data?: Record<string, unknown>) =>
    emit('error', event, {
      ...data,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }),
};
