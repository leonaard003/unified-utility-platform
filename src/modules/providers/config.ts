import type { ProviderFeature } from './types';

/**
 * Environment-driven configuration for the external-provider layer.
 *
 * The whole layer is optional. With no `APIFY_TOKEN` set — the state of a fresh
 * checkout — every feature reports itself as unconfigured and the routers go
 * straight to the local pipeline (yt-dlp / faster-whisper). Nothing throws and
 * nothing is faked; the API just says which source answered.
 *
 * Config is read from `process.env` on every call rather than memoised at
 * import time, so a restart-free env change (or a test) takes effect
 * immediately and route handlers never capture a stale token.
 */

export type ProviderMode =
  /** Default: try providers first, fall back to the local pipeline. */
  | 'hybrid'
  /** Ignore providers entirely, even if a token is present. */
  | 'local-only'
  /** Use providers only; do not fall back to the local pipeline. */
  | 'providers-only';

/** The primary provider wired for each feature, per docs/provider-priority-matrix.md. */
export const DEFAULT_PROVIDERS: Record<ProviderFeature, string> = {
  transcript: 'agentx/video-transcript',
  download: 'agentx/all-video-scraper',
  metadata: 'scrapearchitect/youtube-video-formats-scraper',
};

export const DEFAULT_APIFY_BASE_URL = 'https://api.apify.com';

export interface ProviderConfig {
  mode: ProviderMode;
  apifyToken: string | null;
  apifyBaseUrl: string;
  /** Wall-clock ceiling for a single provider call. */
  timeoutMs: number;
  actors: Record<ProviderFeature, string>;
  /** Provider ids switched off by an operator, e.g. after an outage. */
  disabled: string[];
}

function envString(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function envInt(name: string, fallback: number): number {
  const raw = envString(name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseMode(raw: string | null): ProviderMode {
  switch ((raw ?? '').toLowerCase()) {
    case 'local-only':
    case 'local':
      return 'local-only';
    case 'providers-only':
    case 'providers':
      return 'providers-only';
    default:
      return 'hybrid';
  }
}

export function providerConfig(): ProviderConfig {
  return {
    mode: parseMode(envString('UUP_PROVIDER_MODE')),
    apifyToken: envString('APIFY_TOKEN'),
    apifyBaseUrl: envString('APIFY_BASE_URL') ?? DEFAULT_APIFY_BASE_URL,
    timeoutMs: envInt('UUP_PROVIDER_TIMEOUT_SECONDS', 180) * 1000,
    actors: {
      transcript: envString('UUP_TRANSCRIPT_PROVIDER_PRIMARY') ?? DEFAULT_PROVIDERS.transcript,
      download: envString('UUP_DOWNLOAD_PROVIDER_PRIMARY') ?? DEFAULT_PROVIDERS.download,
      metadata: envString('UUP_METADATA_PROVIDER_PRIMARY') ?? DEFAULT_PROVIDERS.metadata,
    },
    disabled: (envString('UUP_PROVIDER_DISABLED') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

const INPUT_TEMPLATE_ENV: Record<ProviderFeature, string> = {
  transcript: 'UUP_TRANSCRIPT_PROVIDER_INPUT',
  download: 'UUP_DOWNLOAD_PROVIDER_INPUT',
  metadata: 'UUP_METADATA_PROVIDER_INPUT',
};

/**
 * Actor input schemas differ between providers and change over time, so each
 * feature ships a documented default payload that an operator can replace with
 * a JSON template — `{{url}}`, `{{language}}` and `{{mode}}` are substituted —
 * without touching code. An unparseable template is logged and ignored rather
 * than allowed to break the request.
 */
export function buildActorInput(
  feature: ProviderFeature,
  defaults: Record<string, unknown>,
  vars: Record<string, string | undefined>,
): Record<string, unknown> {
  const template = envString(INPUT_TEMPLATE_ENV[feature]);
  if (!template) return defaults;

  const rendered = template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = vars[name] ?? '';
    // Escape for a JSON string context; the template author writes "{{url}}".
    return JSON.stringify(value).slice(1, -1);
  });

  try {
    const parsed = JSON.parse(rendered) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    throw new Error('template is not a JSON object');
  } catch (err) {
    // Imported lazily: config.ts is also read from contexts without a logger sink.
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'warn',
        event: 'providers.input_template_invalid',
        feature,
        env: INPUT_TEMPLATE_ENV[feature],
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return defaults;
  }
}

export interface FeatureAvailability {
  enabled: boolean;
  /** Plain-language reason, present whether enabled or not. */
  reason: string;
  actor: string;
}

/**
 * Whether external providers may be attempted for a feature — and if not, the
 * exact reason, which is logged and echoed back in the API's provider report.
 */
export function featureAvailability(feature: ProviderFeature, config = providerConfig()): FeatureAvailability {
  const actor = config.actors[feature];
  if (config.mode === 'local-only') {
    return { enabled: false, actor, reason: 'UUP_PROVIDER_MODE=local-only — external providers are switched off.' };
  }
  if (!config.apifyToken) {
    return { enabled: false, actor, reason: 'APIFY_TOKEN is not set, so the external provider cannot be called.' };
  }
  if (config.disabled.includes(actor)) {
    return { enabled: false, actor, reason: `${actor} is listed in UUP_PROVIDER_DISABLED.` };
  }
  return { enabled: true, actor, reason: `${actor} is configured and will be tried first.` };
}

/** Whether the local pipeline may be used as the final fallback. */
export function localFallbackAllowed(config = providerConfig()): boolean {
  return config.mode !== 'providers-only';
}

/**
 * Serialisable status for API responses and the UI. Never includes the token —
 * only whether one is present.
 */
export function describeProviderLayer() {
  const config = providerConfig();
  const features: ProviderFeature[] = ['transcript', 'download', 'metadata'];
  return {
    mode: config.mode,
    apifyConfigured: Boolean(config.apifyToken),
    localFallback: localFallbackAllowed(config),
    features: Object.fromEntries(
      features.map((feature) => {
        const availability = featureAvailability(feature, config);
        return [feature, { provider: availability.actor, enabled: availability.enabled, reason: availability.reason }];
      }),
    ) as Record<ProviderFeature, { provider: string; enabled: boolean; reason: string }>,
  };
}
