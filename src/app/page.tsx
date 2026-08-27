import ToolCard from '@/components/ToolCard';

const TOOLS = [
  {
    href: '/tools/transcript',
    title: 'YouTube Transcript',
    description: 'Paste a YouTube URL, fetch captions when available, or use demo mode to test exports.',
  },
  {
    href: '/tools/downloader',
    title: 'Downloader',
    description: 'Check support for YouTube, X, Instagram, and TikTok, then download when the extraction engine is available.',
  },
  {
    href: '/tools/converter',
    title: 'Converter',
    description: 'Real image/document conversion now, plus audio/video conversion when ffmpeg is available.',
  },
  {
    href: '/tools/signature',
    title: 'Signature',
    description: 'Draw or type a signature and export it as a PNG.',
  },
  {
    href: '/tools/paper-calculator',
    title: 'Paper & Printing',
    description: 'Calculate area, sheet fit, and simple print-job cost estimates.',
  },
];

export default function HomePage() {
  return (
    <>
      <section className="card">
        <h1>Utility Tools</h1>
        <p className="lede">
          A functionality-first MVP that groups transcript, downloader, converter, signature, and printing utilities into one modular app. Auto-deploy test marker: ready.
        </p>
        <p className="muted small">
          This build is intentionally honest: tools expose what works locally right now and clearly label anything blocked by missing dependencies or upstream platforms.
        </p>
      </section>

      <section className="grid" aria-label="Tool list">
        {TOOLS.map((tool) => (
          <ToolCard key={tool.href} {...tool} />
        ))}
      </section>
    </>
  );
}
