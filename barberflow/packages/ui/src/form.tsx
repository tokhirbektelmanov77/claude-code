import * as React from 'react';
import { cn } from './cn';

const fieldBase =
  'w-full rounded-xl border border-border bg-surface px-3.5 text-[16px] sm:text-[15px] text-fg placeholder:text-fg-subtle transition-[border-color,box-shadow] duration-150 focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20 disabled:opacity-50 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, 'h-11', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'min-h-20 py-2.5 leading-relaxed', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(fieldBase, 'h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[13px] font-medium text-fg-muted', className)} {...props} />;
}

export function Field({
  label, hint, error, htmlFor, className, children, optionalText,
}: { label?: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; htmlFor?: string; className?: string; children: React.ReactNode; optionalText?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {optionalText && <span className="ml-1 font-normal text-fg-subtle">· {optionalText}</span>}
        </Label>
      )}
      {children}
      {error ? <p role="alert" className="text-[13px] text-danger">{error}</p> : hint ? <p className="text-[13px] text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ className, label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 text-[14px] leading-snug text-fg-muted', className)}>
      <input type="checkbox" className="mt-0.5 size-[18px] shrink-0 cursor-pointer rounded-[5px] accent-[var(--color-primary)]" {...props} />
      <span>{label}</span>
    </label>
  );
}
