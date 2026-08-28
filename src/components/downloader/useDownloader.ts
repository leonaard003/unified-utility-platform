'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type DownloaderAction = { id: string; label: string; support: string; supportLabel: string; note: string };
export type DownloaderPlatform = { id: string; label: string; caveats: string[]; actions: DownloaderAction[] };
export type DownloadMode = 'video' | 'audio';

export type ProbeResponse = {
  engine: { available: boolean; version?: string; ffmpegAvailable: boolean; installHint: string };
  platforms: DownloaderPlatform[];
  detection?: { matched: boolean; reason: string; canonicalUrl: string | null; mediaId: string | null; kind: string | null; platform: DownloaderPlatform | null };
  media?: { title: string; uploader?: string; durationSeconds?: number; thumbnail?: string; formats: { id: string; label: string }[] };
  probeError?: { message: string; hint?: string };
};

export type DownloaderError = { message: string; hint?: string };

/** Turn a non-OK API response into the platform's standard { error: { message, hint } } shape. */
async function readError(response: Response, fallback: string): Promise<DownloaderError> {
  try {
    const data = await response.json();
    return { message: data?.error?.message || fallback, hint: data?.error?.hint };
  } catch {
    return { message: `${fallback} (HTTP ${response.status})` };
  }
}

/**
 * Client-side wrapper around /api/downloader/probe and /api/downloader/download.
 * Shared by the standalone downloader page and the combined transcript page so
 * both flows hit the same endpoints with the same error handling.
 */
export function useDownloader() {
  const [capabilities, setCapabilities] = useState<ProbeResponse | null>(null);
  const [result, setResult] = useState<ProbeResponse | null>(null);
  const [probing, setProbing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<DownloaderError | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/downloader/probe');
        if (!response.ok) return;
        setCapabilities((await response.json()) as ProbeResponse);
      } catch {
        // The engine banner is optional context; probing a URL still reports real errors.
      }
    })();
  }, []);

  const probe = useCallback(async (url: string) => {
    setProbing(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/downloader/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        setError(await readError(response, 'Could not check that URL.'));
        return null;
      }
      const data = (await response.json()) as ProbeResponse;
      setResult(data);
      return data;
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Could not check that URL.' });
      return null;
    } finally {
      setProbing(false);
    }
  }, []);

  const download = useCallback(async (options: { url: string; mode: DownloadMode; formatId?: string }) => {
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch('/api/downloader/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: options.url, mode: options.mode, formatId: options.formatId || undefined }),
      });
      if (!response.ok) {
        setError(await readError(response, 'Download failed.'));
        return false;
      }
      const blob = await response.blob();
      const name = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'download.bin';
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      a.click();
      URL.revokeObjectURL(objectUrl);
      return true;
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Download failed.' });
      return false;
    } finally {
      setDownloading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const formats = useMemo(() => result?.media?.formats || [], [result]);

  return {
    /** Engine/platform capabilities loaded on mount (no URL required). */
    capabilities,
    /** Result of the most recent URL probe. */
    result,
    /** Best available engine/platform info: probe result first, capabilities as fallback. */
    current: result || capabilities,
    probing,
    downloading,
    error,
    formats,
    canDownload: Boolean(result?.detection?.matched && result.engine.available),
    probe,
    download,
    reset,
  };
}
