'use client';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { Alert, Button, Field, Input } from '@barberflow/ui';
import { formatUzPhone, MeDto, normalizeUzPhone } from '@barberflow/shared';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';

/** Formats as the user types: "+998 90 123 45 67". */
function maskPhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (!d.startsWith('998')) d = '998' + d.replace(/^998?/, '');
  d = d.slice(0, 12);
  const p = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean);
  return '+' + p.join(' ');
}

export function OtpLogin({ onSuccess, submitLabel }: { onSuccess: (me: MeDto) => void; submitLabel?: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [step, setStep] = React.useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = React.useState('+998 ');
  const [code, setCode] = React.useState('');
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const codeRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const normalized = normalizeUzPhone(phone);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!normalized) return setError(t('errors.INVALID_PHONE'));
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sent: boolean; devCode?: string }>('/auth/otp/request', { body: { phone: normalized } });
      setDevCode(r.devCode ?? null);
      setStep('code');
      setCode('');
      setCooldown(60);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'SMS_UNAVAILABLE' ? t('auth.smsUnavailable') : t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError(t('errors.OTP_INVALID'));
    setBusy(true);
    setError(null);
    try {
      const me = await api<MeDto>('/auth/otp/verify', { body: { phone: normalized, code } });
      qc.setQueryData(['me'], me);
      onSuccess(me);
    } catch (err) {
      setError(t(errorKey(err)));
      setBusy(false);
    }
  }

  if (step === 'phone') {
    return (
      <form onSubmit={requestCode} className="flex flex-col gap-4" noValidate>
        <Field label={t('auth.phoneLabel')} htmlFor="phone" error={error}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => { setPhone(maskPhone(e.target.value)); setError(null); }}
            placeholder={t('auth.phonePlaceholder')}
            aria-invalid={Boolean(error)}
            className="tabular-nums tracking-wide"
            data-testid="phone-input"
          />
        </Field>
        <Button type="submit" size="lg" block loading={busy} disabled={!normalized} data-testid="send-code">
          {busy ? t('auth.sending') : t('auth.sendCode')}
        </Button>
        <p className="text-center text-[12.5px] leading-relaxed text-fg-subtle">{t('auth.privacyNote')}</p>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
      <button type="button" onClick={() => { setStep('phone'); setError(null); }} className="-ml-1 inline-flex w-fit items-center gap-1 rounded-lg px-1 text-[14px] text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" />{t('auth.changePhone')}
      </button>
      <p className="text-[14px] text-fg-muted">{t('auth.codeSentTo', { phone: formatUzPhone(normalized) })}</p>
      {devCode && (
        <Alert tone="warning" title={<span className="inline-flex items-center gap-1.5"><FlaskConical className="size-4" />{t('auth.devCodeTitle')}</span>}>
          <span data-testid="dev-code-text">{t('auth.devCodeText', { code: devCode })}</span>
        </Alert>
      )}
      <Field label={t('auth.codeLabel')} htmlFor="code" error={error}>
        <Input
          ref={codeRef}
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
          aria-invalid={Boolean(error)}
          className="text-center text-[22px] font-semibold tracking-[0.5em] tabular-nums"
          data-testid="code-input"
        />
      </Field>
      <Button type="submit" size="lg" block loading={busy} disabled={code.length !== 6} data-testid="verify-code">
        {busy ? t('auth.verifying') : submitLabel ?? t('auth.verify')}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={cooldown > 0 || busy} onClick={() => requestCode()}>
        {cooldown > 0 ? t('auth.resendIn', { s: cooldown }) : t('auth.resend')}
      </Button>
    </form>
  );
}
