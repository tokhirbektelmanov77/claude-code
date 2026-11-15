'use client';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { Alert, Button, Field, Input } from '@barberflow/ui';
import { MeDto, normalizeUzPhone } from '@barberflow/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';
import { PhoneInput } from './phone-input';

/**
 * Staff sign-in / sign-up with phone + password (barbers, owners, admins).
 * Clients never see this: they book with name + phone only.
 */
export function StaffAuth({ initialMode = 'login', onSuccess, submitLabel }: { initialMode?: 'login' | 'register'; onSuccess: (me: MeDto) => void; submitLabel?: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [mode, setMode] = React.useState(initialMode);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('+998 ');
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const normalized = normalizeUzPhone(phone);
  const valid = Boolean(normalized) && (mode === 'login' ? password.length > 0 : password.length >= 8 && name.trim().length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!normalized) return setError(t('errors.INVALID_PHONE'));
    setBusy(true);
    setError(null);
    try {
      const me = await api<MeDto>(mode === 'login' ? '/auth/login' : '/auth/register', {
        body: mode === 'login' ? { phone: normalized, password } : { name: name.trim(), phone: normalized, password },
      });
      qc.setQueryData(['me'], me);
      onSuccess(me);
    } catch (err) {
      setError(t(errorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid={`staff-${mode}`}>
      {error && <Alert tone="danger">{error}</Alert>}
      {mode === 'register' && (
        <Field label={t('auth.nameLabel')} htmlFor="sa-name">
          <Input id="sa-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} data-testid="auth-name" />
        </Field>
      )}
      <Field label={t('auth.phoneLabel')} htmlFor="sa-phone">
        <PhoneInput id="sa-phone" value={phone} onChange={(v) => { setPhone(v); setError(null); }} data-testid="auth-phone" />
      </Field>
      <Field label={t('auth.passwordLabel')} htmlFor="sa-pass" hint={mode === 'register' ? t('auth.passwordHint') : undefined}>
        <div className="relative">
          <Input
            id="sa-pass"
            type={show ? 'text' : 'password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            className="pr-11"
            maxLength={128}
            data-testid="auth-password"
          />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t('auth.hide') : t('auth.show')} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-fg-subtle hover:text-fg">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <Button type="submit" size="lg" block loading={busy} disabled={!valid} data-testid="auth-submit">
        {busy ? (mode === 'login' ? t('auth.signingIn') : t('auth.registering')) : submitLabel ?? (mode === 'login' ? t('auth.signIn') : t('auth.register'))}
      </Button>
      <button type="button" className="text-[14px] font-semibold text-accent hover:underline" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }} data-testid="auth-switch">
        {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}
      </button>
      {mode === 'login' && <p className="text-center text-[12.5px] leading-relaxed text-fg-subtle">{t('auth.forgot')}</p>}
    </form>
  );
}
