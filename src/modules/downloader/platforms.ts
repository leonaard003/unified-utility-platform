/**
 * Platform detection and capability disclosure for the downloader.
 *
 * Pure data + regex; no network, no Node built-ins. This is what lets the UI
 * tell a user exactly what is and is not possible for their URL *before*
 * anything heavy runs, and it is covered by tests/downloader.test.ts.
 */

export type PlatformId = 'youtube' | 'x' | 'instagram' | 'tiktok';

export type SupportLevel =
  /** Works whenever the extraction engine is installed and the media is public. */
  | 'supported'
  /** Frequently works, but the platform actively changes behaviour — no promise. */
  | 'best-effort'
  /** Deliberately not implemented in this MVP. */
  | 'not-implemented'
  /** Cannot be done without credentials the platform will not grant anonymously. */
  | 'requires-credentials';

export type ActionId = 'metadata' | 'video' | 'audio' | 'image' | 'thumbnail';

export interface PlatformAction {
  id: ActionId;
  label: string;
  support: SupportLevel;
  /** Plain-language note shown next to the action in the UI. */
  note: string;
}

export interface UrlPattern {
  kind: string;
  regex: RegExp;
  /** Index of the capture group holding the canonical id, when there is one. */
  idGroup?: number;
}

export interface Platform {
  id: PlatformId;
  label: string;
  hosts: string[];
  patterns: UrlPattern[];
  actions: PlatformAction[];
  caveats: string[];
}

const YOUTUBE: Platform = {
  id: 'youtube',
  label: 'YouTube',
  hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com'],
  patterns: [
    { kind: 'video', regex: /^\/watch$/, idGroup: undefined },
    { kind: 'video', regex: /^\/([A-Za-z0-9_-]{11})$/, idGroup: 1 }, // youtu.be/<id>
    { kind: 'short', regex: /^\/shorts\/([A-Za-z0-9_-]{11})/, idGroup: 1 },
    { kind: 'live', regex: /^\/live\/([A-Za-z0-9_-]{11})/, idGroup: 1 },
    { kind: 'embed', regex: /^\/embed\/([A-Za-z0-9_-]{11})/, idGroup: 1 },
  ],
  actions: [
    { id: 'metadata', label: 'Read title, duration, formats', support: 'supported', note: 'Read directly from the public video page by the extraction engine.' },
    { id: 'video', label: 'Download video + audio (MP4/WebM)', support: 'supported', note: 'Muxed or merged; merging separate video and audio streams needs ffmpeg.' },
    { id: 'audio', label: 'Audio-only extraction (M4A/MP3)', support: 'supported', note: 'Re-encoding to MP3 needs ffmpeg; M4A can be taken as-is.' },
    { id: 'thumbnail', label: 'Thumbnail image', support: 'supported', note: 'Public thumbnail URL, no engine required.' },
    { id: 'image', label: 'Image posts', support: 'not-implemented', note: 'YouTube community posts are out of scope for this MVP.' },
  ],
  caveats: [
    'Single videos only — playlists, channels and mixes are rejected on purpose.',
    'Age-restricted, members-only and private videos need a signed-in session and will fail.',
    'YouTube changes its player regularly; keep the extraction engine up to date.',
  ],
};

const X: Platform = {
  id: 'x',
  label: 'X / Twitter',
  hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com', 'fxtwitter.com', 'vxtwitter.com'],
  patterns: [
    { kind: 'post', regex: /^\/[A-Za-z0-9_]{1,15}\/status\/(\d+)/, idGroup: 1 },
    { kind: 'post', regex: /^\/i\/status\/(\d+)/, idGroup: 1 },
    { kind: 'post', regex: /^\/i\/web\/status\/(\d+)/, idGroup: 1 },
  ],
  actions: [
    { id: 'metadata', label: 'Read post text and media list', support: 'best-effort', note: 'Depends on the post being publicly viewable without a login.' },
    { id: 'video', label: 'Download video (MP4)', support: 'best-effort', note: 'Native video and GIF-style media both come back as MP4.' },
    { id: 'audio', label: 'Audio-only extraction', support: 'best-effort', note: 'Extracted from the MP4 with ffmpeg.' },
    { id: 'image', label: 'Download still images', support: 'best-effort', note: 'Only the images attached to the post itself.' },
    { id: 'thumbnail', label: 'Poster frame', support: 'best-effort', note: 'Available when the post carries video.' },
  ],
  caveats: [
    'X has repeatedly restricted logged-out viewing. Any of these actions can start failing without notice.',
    'Protected accounts and age-gated posts are not accessible anonymously.',
    'One post at a time — threads are not walked.',
  ],
};

const INSTAGRAM: Platform = {
  id: 'instagram',
  label: 'Instagram',
  hosts: ['instagram.com', 'www.instagram.com', 'm.instagram.com', 'instagr.am'],
  patterns: [
    { kind: 'post', regex: /^\/p\/([A-Za-z0-9_-]+)/, idGroup: 1 },
    { kind: 'reel', regex: /^\/reels?\/([A-Za-z0-9_-]+)/, idGroup: 1 },
    { kind: 'reel', regex: /^\/[A-Za-z0-9._]+\/reels?\/([A-Za-z0-9_-]+)/, idGroup: 1 },
    { kind: 'igtv', regex: /^\/tv\/([A-Za-z0-9_-]+)/, idGroup: 1 },
    { kind: 'story', regex: /^\/stories\/[A-Za-z0-9._]+\/(\d+)/, idGroup: 1 },
  ],
  actions: [
    { id: 'metadata', label: 'Read caption and media list', support: 'best-effort', note: 'Public posts and reels only.' },
    { id: 'video', label: 'Download reel or post video (MP4)', support: 'best-effort', note: 'Instagram rate-limits logged-out access aggressively.' },
    { id: 'audio', label: 'Audio-only extraction', support: 'best-effort', note: 'Extracted from the MP4 with ffmpeg.' },
    { id: 'image', label: 'Download post images', support: 'best-effort', note: 'Carousels are fetched one item at a time in this MVP — no ZIP bundling yet.' },
    { id: 'thumbnail', label: 'Cover image', support: 'best-effort', note: 'Available for most public posts.' },
  ],
  caveats: [
    'Private accounts and stories require a logged-in session and are not supported.',
    'Instagram blocks datacenter IP ranges frequently; failures here are usually the platform, not the URL.',
    'Carousel bundling into a single ZIP is explicitly out of scope for v1.',
  ],
};

const TIKTOK: Platform = {
  id: 'tiktok',
  label: 'TikTok',
  hosts: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
  patterns: [
    { kind: 'video', regex: /^\/@[A-Za-z0-9._]+\/video\/(\d+)/, idGroup: 1 },
    { kind: 'video', regex: /^\/v\/(\d+)/, idGroup: 1 },
    { kind: 'shortlink', regex: /^\/([A-Za-z0-9]{5,})\/?$/, idGroup: 1 },
    { kind: 'shortlink', regex: /^\/t\/([A-Za-z0-9]{5,})/, idGroup: 1 },
  ],
  actions: [
    { id: 'metadata', label: 'Read title, author, duration', support: 'best-effort', note: 'Public videos only.' },
    { id: 'video', label: 'Download video (MP4)', support: 'best-effort', note: 'Whatever the platform serves publicly — no watermark removal.' },
    { id: 'audio', label: 'Audio-only extraction', support: 'best-effort', note: 'Extracted from the MP4 with ffmpeg.' },
    { id: 'thumbnail', label: 'Cover image', support: 'best-effort', note: 'Available for most public videos.' },
    { id: 'image', label: 'Photo-mode posts', support: 'not-implemented', note: 'TikTok photo carousels are out of scope for this MVP.' },
  ],
  caveats: [
    'No watermark removal — this MVP deliberately makes no such promise.',
    'Short links (vm.tiktok.com) are resolved by the extraction engine, not by this app.',
    'Region-locked videos will fail depending on where the server sits.',
  ],
};

export const PLATFORMS: Platform[] = [YOUTUBE, X, INSTAGRAM, TIKTOK];

export const SUPPORT_LABELS: Record<SupportLevel, string> = {
  supported: 'Supported',
  'best-effort': 'Best effort',
  'not-implemented': 'Not in this MVP',
  'requires-credentials': 'Needs a login',
};

export interface Detection {
  matched: boolean;
  platform: Platform | null;
  /** e.g. `video`, `reel`, `short`, `story`. Null when the path shape is unknown. */
  kind: string | null;
  mediaId: string | null;
  canonicalUrl: string | null;
  /** Why detection landed where it did — always shown to the user. */
  reason: string;
}

function normaliseHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function findPlatform(hostname: string): Platform | null {
  const host = normaliseHost(hostname);
  return (
    PLATFORMS.find((platform) =>
      platform.hosts.some((candidate) => {
        const normalised = normaliseHost(candidate);
        return host === normalised || host.endsWith(`.${normalised}`);
      }),
    ) ?? null
  );
}

/** Rejected up front: bulk sources are explicitly out of scope for v1. */
function bulkRejection(platform: Platform, url: URL): string | null {
  if (platform.id !== 'youtube') return null;
  if (url.pathname === '/playlist' || (url.searchParams.has('list') && !url.searchParams.has('v'))) {
    return 'This is a playlist URL. The MVP handles one video at a time — open a single video and paste that link.';
  }
  if (/^\/(channel|c|user)\//.test(url.pathname) || /^\/@[^/]+\/?$/.test(url.pathname)) {
    return 'This is a channel URL. Paste a link to a single video instead.';
  }
  return null;
}

/**
 * Identify the platform and media shape behind a URL. Never throws — an
 * unrecognised URL is a normal, reportable outcome.
 */
export function detectPlatform(input: string | URL): Detection {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input.includes('://') ? input : `https://${input}`);
  } catch {
    return { matched: false, platform: null, kind: null, mediaId: null, canonicalUrl: null, reason: 'That text is not a URL.' };
  }

  const platform = findPlatform(url.hostname);
  if (!platform) {
    return {
      matched: false,
      platform: null,
      kind: null,
      mediaId: null,
      canonicalUrl: url.toString(),
      reason: `${url.hostname} is not one of the four platforms this MVP covers (YouTube, X, Instagram, TikTok).`,
    };
  }

  const rejection = bulkRejection(platform, url);
  if (rejection) {
    return { matched: false, platform, kind: null, mediaId: null, canonicalUrl: url.toString(), reason: rejection };
  }

  const path = url.pathname.replace(/\/+$/, '') || '/';

  for (const pattern of platform.patterns) {
    const match = pattern.regex.exec(path);
    if (!match) continue;

    let mediaId: string | null = pattern.idGroup ? (match[pattern.idGroup] ?? null) : null;
    if (platform.id === 'youtube' && path === '/watch') {
      mediaId = url.searchParams.get('v');
      if (!mediaId || !/^[A-Za-z0-9_-]{11}$/.test(mediaId)) {
        return {
          matched: false,
          platform,
          kind: null,
          mediaId: null,
          canonicalUrl: url.toString(),
          reason: 'A YouTube /watch URL needs a valid 11-character ?v= video id.',
        };
      }
    }

    return {
      matched: true,
      platform,
      kind: pattern.kind,
      mediaId,
      canonicalUrl: canonicalise(platform, pattern.kind, mediaId, url),
      reason: `Recognised as a ${platform.label} ${pattern.kind}${mediaId ? ` (id ${mediaId})` : ''}.`,
    };
  }

  return {
    matched: false,
    platform,
    kind: null,
    mediaId: null,
    canonicalUrl: url.toString(),
    reason: `The host is ${platform.label}, but "${url.pathname}" is not a single-media URL shape this MVP recognises.`,
  };
}

function canonicalise(platform: Platform, kind: string, mediaId: string | null, url: URL): string {
  if (!mediaId) return url.toString();
  switch (platform.id) {
    case 'youtube':
      return `https://www.youtube.com/watch?v=${mediaId}`;
    case 'x':
      return `https://x.com/i/status/${mediaId}`;
    case 'instagram':
      return kind === 'reel' ? `https://www.instagram.com/reel/${mediaId}/` : url.toString();
    default:
      return url.toString();
  }
}

/** Serialisable form of a platform for the capabilities API. */
export function describePlatform(platform: Platform) {
  return {
    id: platform.id,
    label: platform.label,
    hosts: platform.hosts,
    urlShapes: platform.patterns.map((p) => p.kind).filter((kind, index, all) => all.indexOf(kind) === index),
    actions: platform.actions.map((action) => ({ ...action, supportLabel: SUPPORT_LABELS[action.support] })),
    caveats: platform.caveats,
  };
}
