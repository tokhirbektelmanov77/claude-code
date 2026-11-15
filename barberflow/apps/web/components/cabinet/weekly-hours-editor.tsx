'use client';
import * as React from 'react';
import { Coffee, X } from 'lucide-react';
import { Button, Switch, cn } from '@barberflow/ui';
import { TimeSelect } from '@/components/time-select';
import { formatHm, parseHm } from '@barberflow/shared';
import { useI18n } from '@/lib/i18n';
import { useFormat } from '@/lib/format';

export interface DayEdit { works: boolean; start: string; end: string; lunch: { start: string; end: string } | null }
export type WeekEdit = Record<number, DayEdit>;
export interface Interval { weekday: number; startMin: number; endMin: number }

export function defaultWeek(): WeekEdit {
  const w: WeekEdit = {};
  for (let d = 1; d <= 7; d++) w[d] = { works: d <= 6, start: '10:00', end: '20:00', lunch: null };
  return w;
}

export function weekFromIntervals(intervals: Interval[]): WeekEdit {
  const w = defaultWeek();
  for (let d = 1; d <= 7; d++) {
    const list = intervals.filter((i) => i.weekday === d).sort((a, b) => a.startMin - b.startMin);
    if (!list.length) { w[d] = { ...w[d], works: false }; continue; }
    const first = list[0];
    const last = list[list.length - 1];
    w[d] = {
      works: true,
      start: formatHm(first.startMin),
      end: formatHm(last.endMin),
      lunch: list.length > 1 ? { start: formatHm(first.endMin), end: formatHm(list[1].startMin) } : null,
    };
  }
  return w;
}

/** Returns intervals or null when some day is invalid (end before start, lunch outside hours). */
export function intervalsFromWeek(w: WeekEdit): Interval[] | null {
  const out: Interval[] = [];
  for (let d = 1; d <= 7; d++) {
    const day = w[d];
    if (!day.works) continue;
    const s = parseHm(day.start);
    const e = parseHm(day.end);
    if (s === null || e === null || e <= s) return null;
    if (day.lunch) {
      const ls = parseHm(day.lunch.start);
      const le = parseHm(day.lunch.end);
      if (ls === null || le === null || le <= ls || ls <= s || le >= e) return null;
      out.push({ weekday: d, startMin: s, endMin: ls }, { weekday: d, startMin: le, endMin: e });
    } else out.push({ weekday: d, startMin: s, endMin: e });
  }
  return out;
}

function dayValid(day: DayEdit): boolean {
  const only: WeekEdit = defaultWeek();
  for (let i = 1; i <= 7; i++) only[i] = { ...only[i], works: false };
  only[1] = day;
  return intervalsFromWeek(only) !== null;
}

export function WeeklyHoursEditor({ value, onChange }: { value: WeekEdit; onChange: (w: WeekEdit) => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const set = (d: number, patch: Partial<DayEdit>) => onChange({ ...value, [d]: { ...value[d], ...patch } });
  const copyToAll = (d: number) => {
    const src = value[d];
    const next = { ...value };
    for (let i = 1; i <= 7; i++) if (next[i].works) next[i] = { ...src, lunch: src.lunch ? { ...src.lunch } : null };
    onChange(next);
  };
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const day = value[d];
        const invalid = day.works && !dayValid(day);
        return (
          <div key={d} className="flex flex-col gap-2.5 px-4 py-3">
            <div className="flex items-center gap-3">
              <Switch checked={day.works} onCheckedChange={(c) => set(d, { works: c })} aria-label={f.weekdayLong(d)} />
              <span className={cn('w-28 text-[14.5px] font-medium', !day.works && 'text-fg-subtle')}>{f.weekdayLong(d)}</span>
              {day.works ? (
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  <TimeSelect value={day.start} onChange={(v) => set(d, { start: v })} className="h-9 text-[14px]" aria-label={t('common.from')} />
                  <span className="text-fg-subtle">–</span>
                  <TimeSelect value={day.end} onChange={(v) => set(d, { end: v })} className="h-9 text-[14px]" aria-label={t('common.to')} />
                </div>
              ) : <span className="text-[14px] text-fg-subtle">{t('schedule.off')}</span>}
            </div>
            {day.works && (
              <div className="flex flex-wrap items-center gap-2 pl-[52px]">
                {day.lunch ? (
                  <>
                    <Coffee className="size-4 text-fg-subtle" />
                    <TimeSelect value={day.lunch.start} onChange={(v) => set(d, { lunch: { ...day.lunch!, start: v } })} className="h-8 text-[13.5px]" aria-label={t('schedule.lunch')} />
                    <span className="text-fg-subtle">–</span>
                    <TimeSelect value={day.lunch.end} onChange={(v) => set(d, { lunch: { ...day.lunch!, end: v } })} className="h-8 text-[13.5px]" aria-label={t('schedule.lunch')} />
                    <Button variant="ghost" size="icon-sm" onClick={() => set(d, { lunch: null })} aria-label={t('schedule.removeLunch')}><X /></Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-fg-muted" onClick={() => set(d, { lunch: { start: '13:00', end: '14:00' } })}><Coffee />{t('schedule.addLunch')}</Button>
                )}
                <Button variant="ghost" size="sm" className="h-8 px-2 text-fg-muted" onClick={() => copyToAll(d)}>{t('schedule.copyToAll')}</Button>
                {invalid && <span className="text-[13px] text-danger">{t('schedule.invalidRange')}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
