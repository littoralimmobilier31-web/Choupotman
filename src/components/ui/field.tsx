import * as React from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-fg ' +
  'placeholder:text-fg-subtle transition-[border-color,box-shadow] ' +
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-subtle ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20';

export function Label({
  className,
  required,
  hint,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean; hint?: string }) {
  return (
    <label className={cn('mb-1.5 flex items-baseline gap-1.5 text-[0.8125rem] font-medium text-fg', className)} {...props}>
      <span>{children}</span>
      {required && <span className="text-danger" aria-hidden>*</span>}
      {hint && <span className="text-[0.6875rem] font-normal text-fg-subtle">({hint})</span>}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(control, 'h-10', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(control, 'resize-y leading-relaxed', className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          control,
          'h-10 cursor-pointer appearance-none bg-[length:1.1em] bg-no-repeat pe-9',
          '[background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2371717a\' stroke-width=\'2\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E")]',
          '[background-position:right_0.65rem_center] rtl:[background-position:left_0.65rem_center]',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1.5 text-[0.75rem] font-medium text-danger">{children}</p>;
}

export function FieldHint({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1.5 text-[0.75rem] leading-relaxed text-fg-subtle">{children}</p>;
}

/** Label + control + error/hint, the layout used by every form in the app. */
export function Field({
  label,
  required,
  error,
  hint,
  htmlFor,
  className,
  children,
}: {
  label?: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      <FieldError>{error}</FieldError>
      {!error && <FieldHint>{hint}</FieldHint>}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  name,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  name?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5', disabled && 'cursor-not-allowed opacity-60')}>
      <span className="relative inline-block h-5 w-9 shrink-0">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={cn(
            'absolute inset-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
          )}
        />
        <span
          className={cn(
            'absolute top-0.5 start-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200',
            'peer-checked:translate-x-4 rtl:peer-checked:-translate-x-4',
          )}
        />
      </span>
      {label && <span className="text-sm text-fg">{label}</span>}
    </label>
  );
}

export function Checkbox({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 shrink-0 cursor-pointer rounded border-line-strong bg-surface-raised text-accent',
        'accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
      {...props}
    />
  );
}
