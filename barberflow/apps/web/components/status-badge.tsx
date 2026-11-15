'use client';
import { Badge } from '@barberflow/ui';
import type { AppointmentStatus } from '@barberflow/shared';
import { useI18n } from '@/lib/i18n';

const tone = { CONFIRMED: 'info', COMPLETED: 'success', CANCELLED: 'neutral', NO_SHOW: 'danger' } as const;

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useI18n();
  return <Badge tone={tone[status]}>{t(`status.${status}`)}</Badge>;
}
