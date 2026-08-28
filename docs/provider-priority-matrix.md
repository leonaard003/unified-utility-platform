# Provider Priority Matrix

## Transcript

| Priority | Provider | Platform Scope | Role | Notes |
|---|---|---|---|---|
| 1 | agentx/video-transcript | Multi-platform | Primary | Best fit for one transcript tool across many platforms |
| 2 | nextapi/video-to-text | Multi-platform | Fallback | Simpler generic transcript path |
| 3 | supreme_coder/youtube-transcript-scraper | YouTube | Specialist fallback | Good when URL is YouTube-specific |
| 4 | youtube-video-captions-scraper | YouTube | Optional caption fallback | Caption-based, not true audio ASR |
| 5 | local yt-dlp + faster-whisper | Supported public media | Final fallback | No third-party API cost, but more blocking risk |

## Download

| Priority | Provider | Platform Scope | Role | Notes |
|---|---|---|---|---|
| 1 | agentx/all-video-scraper | Multi-platform | Primary | Best broad fallback candidate |
| 2 | nextapi/youtube-video-downloader | YouTube | Specialist fallback | Strong for YouTube-specific path |
| 3 | youtube-long-video-downloader | YouTube long-form | Specialist fallback | Better for longer videos |
| 4 | tiktok-video-audio-mp3-downloader | TikTok | Specialist fallback | Video/audio focus |
| 5 | instagram-post-video-scraper-video-post-downloader | Instagram | Specialist fallback | Good blend of media + metadata |
| 6 | x-twitter-video-downloader | X/Twitter | Specialist fallback | Download-focused |
| 7 | local yt-dlp | Multi-platform where supported | Final fallback | Keep as internal backup |

## Metadata / Quality

| Priority | Provider | Platform Scope | Role | Notes |
|---|---|---|---|---|
| 1 | youtube-video-formats-scraper | YouTube | Primary metadata/quality | Good for quality picker |
| 2 | instagram-video-scraper-lite | Instagram | Primary IG metadata | Lighter metadata-only path |
| 3 | agentx/all-video-scraper | Multi-platform | General fallback | Metadata + download combined |
| 4 | local yt-dlp probe | Multi-platform where supported | Final fallback | Already in app |

## Implementation Rule

Use **platform-specific providers only when they materially outperform the general provider**. Otherwise:
- try general provider first,
- fall back to specialist provider,
- fall back to local pipeline,
- fail clearly.
