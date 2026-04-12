interface RateLimitAlertProps {
  visible: boolean;
  message?: string;
}

function RateLimitAlert({
  visible,
  message = 'Too many attempts. Please wait a moment.',
}: RateLimitAlertProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-md bg-(--destructive)/10 p-3 text-sm text-(--destructive)"
    >
      {message}
    </div>
  );
}

export { RateLimitAlert, type RateLimitAlertProps };
