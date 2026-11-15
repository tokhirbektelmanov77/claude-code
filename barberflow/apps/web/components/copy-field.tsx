'use client';
import * as React from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@barberflow/ui';
import { useI18n } from '@/lib/i18n';

export function CopyField({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked: user can still select the text */ }
  };
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-[13px] font-medium text-fg-muted">{label}</span>}
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 p-1 pl-3.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[13.5px]" title={value}>{value}</span>
        <Button variant="ghost" size="icon-sm" asChild aria-label={t('common.open')}>
          <a href={value} target="_blank" rel="noreferrer"><ExternalLink /></a>
        </Button>
        <Button variant="secondary" size="sm" onClick={copy} aria-live="polite">
          {copied ? <Check /> : <Copy />}{copied ? t('common.copied') : t('common.copy')}
        </Button>
      </div>
    </div>
  );
}
