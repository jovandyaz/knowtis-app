import type { ReactNode } from 'react';

export interface FormFieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
}

export function FormField({ id, label, error, children }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-(--foreground)">
        {label}
      </label>
      {children}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-sm text-(--destructive)"
        >
          {error}
        </p>
      )}
    </div>
  );
}
