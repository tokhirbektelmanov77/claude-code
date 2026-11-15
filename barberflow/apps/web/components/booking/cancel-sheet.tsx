'use client';
import * as React from 'react';
import { Alert, Button, Field, Sheet, Textarea } from '@barberflow/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';

export function CancelSheet({ open, onOpenChange, endpoint, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; endpoint: string; onDone: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api(endpoint, { body: { reason: reason.trim() || null } });
      onDone();
      onOpenChange(false);
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={t('me.cancelTitle')}
      description={t('me.cancelText')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" block onClick={() => onOpenChange(false)}>{t('common.back')}</Button>
          <Button variant="danger" block loading={busy} onClick={submit} data-testid="cancel-submit">{t('booking.cancelBooking')}</Button>
        </>
      }
    >
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      <Field label={t('me.cancelReason')}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={2} />
      </Field>
    </Sheet>
  );
}
