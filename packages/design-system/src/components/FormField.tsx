import { forwardRef, type ReactNode } from 'react';

export interface FormFieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
}

const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  ({ id, label, error, children }, ref) => (
    <div ref={ref} className="space-y-2">
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
  )
);
FormField.displayName = 'FormField';

export { FormField };
