import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-xl bg-surface-3/70', className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-fg-subtle', className)} aria-hidden />;
}

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-surface-2 text-fg-muted',
      success: 'bg-success/12 text-success',
      warning: 'bg-warning/15 text-warning-fg',
      danger: 'bg-danger/10 text-danger',
      accent: 'bg-accent/12 text-accent',
      info: 'bg-info/10 text-info',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const alertIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

export function Alert({
  tone = 'info', title, children, className, action,
}: { tone?: keyof typeof alertIcons; title?: React.ReactNode; children?: React.ReactNode; className?: string; action?: React.ReactNode }) {
  const Icon = alertIcons[tone];
  const tones = {
    info: 'border-info/20 bg-info/6 [&_svg]:text-info',
    success: 'border-success/25 bg-success/8 [&_svg]:text-success',
    warning: 'border-warning/30 bg-warning/10 [&_svg]:text-warning-fg',
    danger: 'border-danger/25 bg-danger/6 [&_svg]:text-danger',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border p-3.5 text-[14px]', tones[tone], className)}>
      <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className={cn('text-fg-muted', title && 'mt-0.5')}>{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon, title, text, action, className,
}: { icon?: React.ComponentType<{ className?: string }>; title: React.ReactNode; text?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-surface-2 text-fg-subtle">
          <Icon className="size-6" />
        </div>
      )}
      <p className="text-[15px] font-medium text-fg">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[14px] text-fg-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
