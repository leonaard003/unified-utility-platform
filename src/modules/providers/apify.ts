import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { providerConfig } from './config';

/**
 * Thin Apify client.
 *
 * Every wired provider (`agentx/video-transcript`, `agentx/all-video-scraper`,
 * `scrapearchitect/youtube-video-formats-scraper`) is an Apify actor, so one
 * client covers all three. It calls the real
 * `run-sync-get-dataset-items` endpoint and returns the dataset rows verbatim —
 * normalisation happens in the feature adapters, and there is no stub or sample
 * payload anywhere in this file. With no token configured it refuses to
 * pretend, and the router falls back to the local pipeline.
 */

/** Apify addresses actors with `~` where the console shows `/`. */
export function actorPath(actorId: string): string {
  return actorId.trim().replace(/^\/+|\/+$/g, '').replace(/\//g, '~');
}

export function apifyConfigured(): boolean {
  return Boolean(providerConfig().apifyToken);
}

export interface ActorRunOptions {
  timeoutMs?: number;
  /** Actor memory in MB. Left to the actor's own default when unset. */
  memoryMbytes?: number;
}

/**
 * Run an actor synchronously and return its dataset items.
 * Throws `AppError` on any non-success; callers treat that as "this provider
 * did not answer" and move down the chain.
 */
export async function runActorForItems(
  actorId: string,
  input: Record<string, unknown>,
  options: ActorRunOptions = {},
): Promise<unknown[]> {
  const config = providerConfig();
  if (!config.apifyToken) {
    throw new AppError('DEPENDENCY_MISSING', 'No APIFY_TOKEN is configured, so external providers cannot be called.', {
      hint: 'Set APIFY_TOKEN in .env.local to enable the provider layer, or leave it unset to stay on the local pipeline.',
    });
  }

  const timeoutMs = options.timeoutMs ?? config.timeoutMs;
  const url = new URL(`/v2/acts/${actorPath(actorId)}/run-sync-get-dataset-items`, config.apifyBaseUrl);
  // Apify's own run timeout, so a stuck actor is cut server-side too.
  url.searchParams.set('timeout', String(Math.max(30, Math.ceil(timeoutMs / 1000))));
  if (options.memoryMbytes) url.searchParams.set('memory', String(options.memoryMbytes));

  const controller = new AbortController();
  // A few seconds of slack so Apify's timeout wins and reports a useful body.
  const timer = setTimeout(() => controller.abort(), timeoutMs + 5_000);
  const startedAt = Date.now();

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apifyToken}` },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: 'no-store',
    });
    text = await response.text();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AppError('TIMEOUT', `${actorId} did not finish in time.`, {
        hint: `Cancelled after ${Math.round(timeoutMs / 1000)}s. Raise UUP_PROVIDER_TIMEOUT_SECONDS or let the local pipeline handle it.`,
      });
    }
    throw new AppError('UPSTREAM_BLOCKED', `Could not reach the ${actorId} provider.`, {
      hint: err instanceof Error ? err.message : 'Check the server network connection.',
    });
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    logger.warn('providers.apify_http_error', {
      actor: actorId,
      status: response.status,
      durationMs,
      body: text.slice(0, 300),
    });
    if (response.status === 401 || response.status === 403) {
      throw new AppError('DEPENDENCY_MISSING', `Apify rejected the configured token for ${actorId}.`, {
        hint: 'Check APIFY_TOKEN and that the account has access to this actor.',
      });
    }
    if (response.status === 404) {
      throw new AppError('NOT_AVAILABLE', `Apify does not know an actor called ${actorId}.`, {
        hint: 'Check the actor id in the UUP_*_PROVIDER_PRIMARY environment variable.',
      });
    }
    if (response.status === 408 || response.status === 504) {
      throw new AppError('TIMEOUT', `${actorId} timed out on Apify's side.`);
    }
    throw new AppError('UPSTREAM_BLOCKED', `${actorId} returned HTTP ${response.status}.`, {
      hint: text.slice(0, 200) || undefined,
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new AppError('UPSTREAM_BLOCKED', `${actorId} returned a response this app could not read.`);
  }

  const items = Array.isArray(payload) ? payload : [payload];
  logger.info('providers.apify_run', { actor: actorId, durationMs, items: items.length });
  return items;
}
