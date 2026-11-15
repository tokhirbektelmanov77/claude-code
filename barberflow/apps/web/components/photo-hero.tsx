import * as React from 'react';
import { cn } from '@barberflow/ui';

/**
 * Full-bleed atmospheric photo with a readability scrim; content sits at the bottom.
 * `src` is the business cover (coverUrl) or the bundled fallback in /public/images.
 * The scrim is functional (contrast for text over any photo), not decoration.
 */
export function PhotoHero({ src, className, children }: { src: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('relative isolate flex flex-col justify-end overflow-hidden bg-bg', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- covers may come from any owner-provided URL */}
      <img src={src} alt="" aria-hidden fetchPriority="high" className="absolute inset-0 -z-20 size-full object-cover object-center" />
      <div className="bf-scrim absolute inset-0 -z-10" aria-hidden />
      {children}
    </section>
  );
}
