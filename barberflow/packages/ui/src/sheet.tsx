'use client';
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './cn';

/**
 * Bottom sheet on phones, centered dialog on larger screens. Built on Radix Dialog
 * (focus trap, Esc, aria) — the shadcn/ui approach.
 */
export function Sheet({
  open, onOpenChange, title, description, children, footer, size = 'md', closeLabel = 'Close',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeLabel?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bf-overlay fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[3px]" />
        <DialogPrimitive.Content
          className={cn(
            'bf-sheet fixed z-50 flex max-h-[92dvh] flex-col border-border bg-surface shadow-[0_-12px_40px_rgb(0_0_0/0.35)] outline-none sm:border',
            'inset-x-0 bottom-0 rounded-t-3xl pb-[env(safe-area-inset-bottom)]',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pb-0',
            size === 'sm' && 'sm:max-w-md',
            size === 'md' && 'sm:max-w-lg',
            size === 'lg' && 'sm:max-w-2xl',
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-[19px] font-bold tracking-[-0.02em]">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-[14px] text-fg-muted">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{typeof title === 'string' ? title : ''}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg" aria-label={closeLabel}>
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2 sm:px-6">{children}</div>
          {footer && <div className="flex gap-2 border-t border-border px-5 py-3.5 sm:px-6">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
