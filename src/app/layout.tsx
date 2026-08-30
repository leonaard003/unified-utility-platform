import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';
import Nav from '@/components/Nav';
import './globals.css';

// Self-hosted at build time: the browser never calls fonts.googleapis.com,
// so the page has no third-party dependency at runtime.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Utility Tools',
  description:
    'Transcript, downloader, converter, signature and paper/printing tools in one modular app.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <div className="aurora" aria-hidden="true" />
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="site-header">
          <div className="site-header-inner">
            <a className="brand" href="/">
              Utility Tools
            </a>
            <Nav />
          </div>
        </header>
        <main id="main">
          <div className="container">{children}</div>
        </main>
        <footer className="site-footer">
          <div className="container">
            MVP build — no accounts, no history. Uploaded and generated files are temporary and
            swept automatically. See <a href="/about">About</a> for limits and disclaimers.
          </div>
        </footer>
      </body>
    </html>
  );
}
