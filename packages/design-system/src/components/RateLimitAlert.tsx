import { forwardRef } from 'react';

interface RateLimitAlertProps {
  visible: boolean;
  message?: string;
}

const RateLimitAlert = forwardRef<HTMLDivElement, RateLimitAlertProps>(
  ({ visible, message = 'Too many attempts. Please wait a moment.' }, ref) => {
    if (!visible) {
      return null;
    }

    return (
      <div
        ref={ref}
        role="alert"
        aria-live="polite"
        className="rounded-md bg-(--destructive)/10 p-3 text-sm text-(--destructive)"
      >
        {message}
      </div>
    );
  }
);
RateLimitAlert.displayName = 'RateLimitAlert';

export { RateLimitAlert, type RateLimitAlertProps };
