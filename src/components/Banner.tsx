import type { ReactNode } from 'react';

export type BannerTone = 'info' | 'ok' | 'warn' | 'error';

/**
 * Single component for every status message in the app so that success,
 * degraded and failure states are visually distinguishable and announced to
 * screen readers.
 */
export default function Banner({
  tone,
  title,
  children,
}: {
  tone: BannerTone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`banner ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <strong>{title}</strong>
      {children}
    </div>
  );
}
