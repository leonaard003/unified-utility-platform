/**
 * Public surface of the provider layer.
 *
 * API routes should import from here (`@/modules/providers`) rather than from
 * an individual adapter, so the routing policy stays in `router.ts` and the
 * feature modules can be reordered or extended without touching the routes.
 */
export { describeProviderLayer, featureAvailability, localFallbackAllowed, providerConfig, DEFAULT_PROVIDERS } from './config';
export type { ProviderMode } from './config';
export { LOCAL_MEDIA_ID, LOCAL_TRANSCRIPT_ID, providerReport, routeDownload, routeMediaInfo, routeTranscript } from './router';
export type { RoutedTranscript } from './router';
export { parseFormatId, tagProviderFormatId, PROVIDER_FORMAT_PREFIX } from './types';
export type {
  ProviderAttempt,
  ProviderDownloadResult,
  ProviderFeature,
  ProviderMediaFormat,
  ProviderMediaInfoResult,
  ProviderTranscriptResult,
  ResultSource,
  RoutedResult,
} from './types';
