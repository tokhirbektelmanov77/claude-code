'use client';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@barberflow/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div role="group" aria-label={t('common.language')} className={cn('inline-flex h-9 items-center rounded-full border border-border bg-surface-2/80 p-0.5 text-[12.5px] font-bold tracking-wide', className)}>
      {(['ru', 'uz'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          data-testid={`lang-${l}`}
          className={cn('h-8 rounded-full px-3 transition-all', locale === l ? 'bg-primary text-primary-fg shadow-sm' : 'text-fg-muted hover:text-fg')}
        >
          {l === 'ru' ? 'RU' : 'UZ'}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const [pref, setPref] = useTheme();
  const next = pref === 'dark' ? 'light' : 'dark';
  const Icon = pref === 'dark' ? Moon : Sun;
  const label = pref === 'dark' ? t('common.themeDark') : t('common.themeLight');
  return (
    <button
      type="button"
      onClick={() => setPref(next)}
      title={`${t('common.theme')}: ${label}`}
      aria-label={`${t('common.theme')}: ${label}`}
      className={cn('grid size-9 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg', className)}
      data-testid="theme-toggle"
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
