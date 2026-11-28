import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string | null; hint?: string };

export const Field = forwardRef<HTMLInputElement, Props>(function Field({ label, error, hint, className = "", id, ...props }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const msgId = `${inputId}-msg`;
  return (
    <div className={`grid content-start gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-semibold">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? msgId : undefined}
        className={`min-h-11 rounded-xl border bg-paper px-3.5 text-base text-ink outline-none transition placeholder:text-muted focus:border-ink ${
          error ? "border-danger" : "border-line"
        }`}
        {...props}
      />
      {(error || hint) && (
        <p id={msgId} className={`text-sm ${error ? "text-danger" : "text-muted"}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
});
