interface RateLimitAlertProps {
  visible: boolean;
}

function RateLimitAlert({ visible }: RateLimitAlertProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-md bg-(--destructive)/10 p-3 text-sm text-(--destructive)"
    >
      Too many attempts. Please wait a moment.
    </div>
  );
}

export { RateLimitAlert, type RateLimitAlertProps };
