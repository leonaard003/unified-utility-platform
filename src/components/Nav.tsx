'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/tools/transcript', label: 'Transcript' },
  { href: '/tools/converter', label: 'Converter' },
  { href: '/tools/signature', label: 'Signature' },
  { href: '/tools/paper-calculator', label: 'Paper & Printing' },
  { href: '/about', label: 'About' },
] as const;

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Primary">
      {NAV_LINKS.map((link) => {
        const current = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} aria-current={current ? 'page' : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
