'use client';
import * as React from 'react';
import { Select, cn } from '@barberflow/ui';
import { formatHm } from '@barberflow/shared';

/**
 * 24-hour time picker. Native <input type="time"> follows the OS locale (12h AM/PM on many
 * phones), which is confusing for 24-hour Uzbekistan schedules, so we render explicit HH:mm options.
 */
export function TimeSelect({
  value, onChange, step = 15, from = 0, to = 24 * 60, className, allowEmpty, ...rest
}: { value: string; onChange: (v: string) => void; step?: number; from?: number; to?: number; className?: string; allowEmpty?: boolean } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  const options: string[] = [];
  for (let m = from; m <= to; m += step) options.push(formatHm(m));
  if (value && !options.includes(value)) options.push(value);
  options.sort();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={cn('w-[92px] tabular-nums', className)} {...rest}>
      {allowEmpty && <option value="">—:—</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </Select>
  );
}
