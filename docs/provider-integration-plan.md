# tools.aviroam.com Provider Integration Plan

## Goal
Add a resilient external-provider layer to `tools.aviroam.com` so transcript, download, and metadata features do not depend on only one local pipeline.

The current app already has:
- local downloader flow via `yt-dlp`
- local ASR transcript flow via `faster-whisper`
- UI that combines transcript + download in one page

This plan adds a provider router on top so the app can:
1. try external providers first or second,
2. fall back when one source is blocked,
3. keep the current local pipeline as a backup rather than the only path.

---

## Recommended Provider Stack

### Transcript Providers

#### Primary
- `agentx/video-transcript`
- Use for multi-platform transcript requests across YouTube, TikTok, Instagram, and similar public video URLs.
- Why: broad platform scope and transcript-first focus.

#### Fallback 1
- `nextapi/video-to-text`
- Use when primary transcript provider fails.
- Why: simpler generic video-to-text path.

#### Fallback 2 (YouTube-specific)
- `supreme_coder/youtube-transcript-scraper`
- Use when the URL is YouTube and generic transcript providers fail.
- Why: specialized YouTube transcript extraction.

#### Optional caption-only fallback
- `scrapearchitect/youtube-video-captions-scraper`
- Use only for YouTube when a caption-based fallback is acceptable.
- Why: can return subtitle/caption assets directly.

---

### Download Providers

#### Primary multi-platform
- `agentx/all-video-scraper`
- Use for general download requests and metadata fallback.
- Why: broad platform coverage and combined metadata/download positioning.

#### Platform-specific fallback providers
- YouTube: `nextapi/youtube-video-downloader`
- YouTube long-form: `scrapearchitect/youtube-long-video-downloader`
- TikTok: `scrapearchitect/tiktok-video-audio-mp3-downloader`
- Instagram: `scrapearchitect/instagram-post-video-scraper-video-post-downloader`
- X/Twitter: `scrapearchitect/x-twitter-video-downloader`

---

### Metadata / Quality Providers

#### YouTube
- `scrapearchitect/youtube-video-formats-scraper`
- Use to populate quality / format choices.

#### Instagram metadata
- `scrapearchitect/instagram-video-scraper-lite`
- Use for lighter metadata-only lookups.

#### General metadata fallback
- `agentx/all-video-scraper`

---

## Provider Priority Matrix

| Feature | Platform | Primary | Fallback 1 | Fallback 2 | Last Resort |
|---|---|---|---|---|---|
| Transcript | YouTube | agentx/video-transcript | nextapi/video-to-text | supreme_coder/youtube-transcript-scraper | local yt-dlp + faster-whisper |
| Transcript | TikTok | agentx/video-transcript | nextapi/video-to-text | ingeniela/tiktok-video-transcriber | local yt-dlp + faster-whisper |
| Transcript | Instagram | agentx/video-transcript | nextapi/video-to-text | local yt-dlp + faster-whisper | fail clearly |
| Transcript | X/Twitter | agentx/video-transcript | nextapi/video-to-text | local yt-dlp + faster-whisper | fail clearly |
| Download | YouTube | agentx/all-video-scraper | nextapi/youtube-video-downloader | scrapearchitect/youtube-long-video-downloader | local yt-dlp |
| Download | TikTok | agentx/all-video-scraper | scrapearchitect/tiktok-video-audio-mp3-downloader | nextapi/tiktok-video-downloader | local yt-dlp |
| Download | Instagram | agentx/all-video-scraper | scrapearchitect/instagram-post-video-scraper-video-post-downloader | instagram-video-scraper-lite (metadata only) | local yt-dlp |
| Download | X/Twitter | agentx/all-video-scraper | scrapearchitect/x-twitter-video-downloader | local yt-dlp | fail clearly |
| Metadata | YouTube | youtube-video-formats-scraper | nextapi/youtube-video-downloader | local yt-dlp probe | fail clearly |
| Metadata | TikTok | agentx/all-video-scraper | tiktok downloader provider | local yt-dlp probe | fail clearly |
| Metadata | Instagram | instagram-video-scraper-lite | instagram post/video downloader | local yt-dlp probe | fail clearly |
| Metadata | X/Twitter | x-twitter-video-downloader | agentx/all-video-scraper | local yt-dlp probe | fail clearly |

---

## Recommended App Architecture

## 1. New provider abstraction layer
Create a provider layer separate from existing local engines.

Suggested files:
- `src/modules/providers/types.ts`
- `src/modules/providers/router.ts`
- `src/modules/providers/config.ts`
- `src/modules/providers/transcript.ts`
- `src/modules/providers/download.ts`
- `src/modules/providers/metadata.ts`
- `src/modules/providers/apify.ts`

---

## 2. Unified result shapes
Normalize all providers to the same internal shapes.

### Transcript result
```ts
interface ProviderTranscriptResult {
  platform: string;
  sourceUrl: string;
  title?: string;
  language?: string;
  provider: string;
  segments: { start: number; duration: number; text: string }[];
  raw?: unknown;
}
```

### Download metadata result
```ts
interface ProviderMediaInfoResult {
  platform: string;
  sourceUrl: string;
  title?: string;
  thumbnail?: string;
  durationSeconds?: number;
  provider: string;
  formats: { id: string; label: string; ext?: string; resolution?: string }[];
  raw?: unknown;
}
```

### Download execution result
```ts
interface ProviderDownloadResult {
  provider: string;
  filename: string;
  contentType: string;
  bytes?: Buffer;
  downloadUrl?: string;
  expiresAt?: string;
  raw?: unknown;
}
```

---

## 3. Routing rules

### Transcript route
1. detect platform
2. choose transcript provider chain by platform
3. try provider primary
4. on provider error, try fallback
5. if all provider APIs fail, try local pipeline when supported
6. if all fail, return one clear user-facing error

### Download route
1. detect platform
2. ask metadata provider for quality/formats
3. show normalized options in UI
4. on download request, use chosen provider
5. if provider fails, fall back to platform-specific alternative
6. if all fail, use local `yt-dlp` where possible

---

## Recommended Environment Variables

```env
# Generic provider toggle
UUP_PROVIDER_MODE=hybrid

# Apify / provider auth
APIFY_TOKEN=

# Optional provider choice overrides
UUP_TRANSCRIPT_PROVIDER_PRIMARY=agentx/video-transcript
UUP_TRANSCRIPT_PROVIDER_FALLBACK=nextapi/video-to-text
UUP_DOWNLOAD_PROVIDER_PRIMARY=agentx/all-video-scraper

# Existing local fallbacks
YTDLP_PATH=
FFMPEG_PATH=
UUP_ASR_PYTHON=
UUP_WHISPER_MODEL=tiny
```

---

## Recommended Rollout Order

### Phase 1
Implement transcript provider abstraction only.
- wire provider router
- add primary + fallback transcript providers
- keep local ASR as backup

### Phase 2
Implement metadata provider abstraction for download quality listing.
- start with YouTube + TikTok
- normalize format lists

### Phase 3
Implement external download execution providers.
- general provider first
- platform-specific fallbacks second

### Phase 4
Add cost control and observability.
- provider success/failure logging
- fallback counters
- request timing
- budget limits per provider

---

## UI Recommendations

### Transcript page
Keep the current combined page, but add:
- provider status badge after probe/transcript
- “Using external provider” vs “Using local fallback” label
- clearer blocked-video message with fallback guidance

### Download flow
If a provider probe fails:
- show disabled quality selector
- explain that quality options appear after successful probe
- optionally show “Try with cookies” helper text

---

## Cost / Risk Controls

### Controls to add
- hard timeout per provider request
- per-provider retry cap
- request logging by provider name
- one global fallback order per platform
- feature flag to disable an unstable provider quickly

### Risks
- provider costs can grow with traffic
- some providers may disappear/change pricing
- some listed APIs may overpromise success rates
- third-party hosted APIs add dependency risk

---

## My Final Recommendation

For `tools.aviroam.com`, the best integration strategy is:

1. **do not replace the current local pipeline**,
2. **add a provider abstraction layer**,
3. **use external providers as primary/fallback depending on feature**,
4. **keep local yt-dlp + faster-whisper as the final fallback where possible**.

This gives you:
- better success rate,
- less breakage from one provider failing,
- clearer UX,
- easier future scaling.
