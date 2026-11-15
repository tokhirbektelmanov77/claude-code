import type { Metadata } from 'next';

// Secret links: never index, never send the full URL as referrer.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
