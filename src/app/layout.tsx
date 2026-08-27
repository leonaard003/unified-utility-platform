import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Nav from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Unified Utility Platform',
  description:
    'Transcript, downloader, converter, signature and paper/printing tools in one modular app.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="site-header">
          <div className="site-header-inner">
            <a className="brand" href="/">
              Unified Utility Platform
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
