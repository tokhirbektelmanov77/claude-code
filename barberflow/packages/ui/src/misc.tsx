'use client';
import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from './cn';

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-surface-3 border-border',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full shadow-sm ring-0 transition-transform data-[state=checked]:bg-primary-fg data-[state=unchecked]:bg-fg-muted data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}

export function Segmented<T extends string>({
  value, onChange, options, className, size = 'md',
}: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-xl border border-border bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-[9px] font-semibold transition-all duration-150',
            size === 'sm' ? 'px-2.5 py-1 text-[13px]' : 'px-3.5 py-1.5 text-[14px]',
            o.value === value ? 'bg-primary text-primary-fg shadow-sm' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, src, size = 44, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  // Deterministic tone from the leather palette per name (no random colours).
  const tones = [['#6B4A2E', '#F4EBDF'], ['#A88462', '#1A120E'], ['#D5C4AE', '#1A120E'], ['#4A4A46', '#F4EBDF'], ['#4D3222', '#D5C4AE']];
  const [bgTone, fgTone] = tones[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % tones.length];
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className={cn('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />
  ) : (
    <div
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-full font-semibold', className)}
      style={{ width: size, height: size, fontSize: size * 0.36, background: bgTone, color: fgTone }}
    >
      {initials || '•'}
    </div>
  );
}

/** BARBERFLOW wordmark ("BARBERFLOW." with an accent full stop), as in the approved Espresso design. */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-baseline font-extrabold tracking-[-0.03em] text-fg', className)} aria-label="BARBERFLOW">
      {compact ? (
        <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-[15px] text-primary-fg">B<span className="text-accent-fg/60">.</span></span>
      ) : (
        <span className="text-[17px] leading-none">BARBERFLOW<span className="text-accent">.</span></span>
      )}
    </span>
  );
}

export function Stat({ label, value, hint, className }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border bg-surface p-4', className)}>
      <p className="text-[13px] text-fg-muted">{label}</p>
      <p className="mt-1.5 text-[28px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-[12px] leading-snug text-fg-subtle">{hint}</p>}
    </div>
  );
}
