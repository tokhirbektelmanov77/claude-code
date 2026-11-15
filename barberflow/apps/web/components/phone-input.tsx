'use client';
import * as React from 'react';
import { Input } from '@barberflow/ui';

/** Formats as the user types: "+998 90 123 45 67". */
export function maskPhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (!d.startsWith('998')) d = '998' + d.replace(/^998?/, '');
  d = d.slice(0, 12);
  const p = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean);
  return '+' + p.join(' ');
}

export const PhoneInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }>(
  ({ value, onChange, className, ...rest }, ref) => (
    <Input
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value || '+998 '}
      onChange={(e) => onChange(maskPhone(e.target.value))}
      className={['tabular-nums tracking-wide', className].filter(Boolean).join(' ')}
      {...rest}
    />
  ),
);
PhoneInput.displayName = 'PhoneInput';
