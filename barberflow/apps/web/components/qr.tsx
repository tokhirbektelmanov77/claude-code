'use client';
import * as React from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';
import { Button, Skeleton } from '@barberflow/ui';
import { useI18n } from '@/lib/i18n';

/** QR generated locally in the browser; the URL never leaves the device. */
export function QrCard({ url, fileName }: { url: string; fileName: string }) {
  const { t } = useI18n();
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: 'M', color: { dark: '#1c1917', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [url]);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl border border-border bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={url} className="size-44" data-testid="qr" /> : <Skeleton className="size-44" />}
      </div>
      <Button asChild variant="outline" size="sm" disabled={!src}>
        <a href={src ?? '#'} download={`${fileName}.png`}><Download />{t('linkPage.downloadQr')}</a>
      </Button>
    </div>
  );
}
