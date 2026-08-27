/**
 * A single error shape shared by every module and API route.
 *
 * `code` is machine-readable and stable; `message` is plain-language text that is
 * safe to show a user directly (accessibility baseline: no stack traces, no jargon).
 */
export type AppErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED'
  | 'NOT_AVAILABLE'
  | 'DEPENDENCY_MISSING'
  | 'UPSTREAM_BLOCKED'
  | 'TOO_LARGE'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  /** Optional actionable next step shown under the error message in the UI. */
  readonly hint?: string;

  constructor(code: AppErrorCode, message: string, options: { status?: number; hint?: string } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? defaultStatus(code);
    this.hint = options.hint;
  }
}

function defaultStatus(code: AppErrorCode): number {
  switch (code) {
    case 'INVALID_INPUT':
      return 400;
    case 'UNSUPPORTED':
      return 415;
    case 'NOT_AVAILABLE':
      return 404;
    case 'DEPENDENCY_MISSING':
      return 503;
    case 'UPSTREAM_BLOCKED':
      return 502;
    case 'TOO_LARGE':
      return 413;
    case 'RATE_LIMITED':
      return 429;
    case 'TIMEOUT':
      return 504;
    default:
      return 500;
  }
}

export interface ErrorPayload {
  error: { code: AppErrorCode; message: string; hint?: string };
}

export function toErrorPayload(err: unknown): { status: number; body: ErrorPayload } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, hint: err.hint } },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong while processing your request.',
        hint: 'Check the server logs for details, then try again.',
      },
    },
  };
}
