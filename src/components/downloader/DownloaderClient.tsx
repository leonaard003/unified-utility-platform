'use client';

import { useState } from 'react';
import Link from 'next/link';
import Banner from '@/components/Banner';
import DownloadPanel from '@/components/downloader/DownloadPanel';
import { useDownloader } from '@/components/downloader/useDownloader';

export default function DownloaderClient() {
  const [url, setUrl] = useState('');
  const downloader = useDownloader();

  return (
    <div className="card">
      <h1>Downloader</h1>
      <p className="lede">Paste one public URL from YouTube, X, Instagram, or TikTok. The app tells you what the URL is, what the module supports, and whether the extraction engine is installed.</p>

      <Banner tone="info" title="Transcript and download now live on one page">
        <div className="hint">
          <Link href="/tools/transcript">Video Transcript</Link> now handles both flows from a single URL field. This page still works as a fallback download-only view.
        </div>
      </Banner>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void downloader.probe(url);
        }}
      >
        <div className="field">
          <label htmlFor="dl-url">Public media URL</label>
          <input id="dl-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required />
        </div>
      </form>

      <DownloadPanel url={url} downloader={downloader} />
    </div>
  );
}
