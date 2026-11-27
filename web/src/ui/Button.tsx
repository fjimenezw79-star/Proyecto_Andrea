import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "solid" | "wine" | "ghost" | "quiet" | "danger";
const styles: Record<Variant, string> = {
  solid: "bg-ink text-paper hover:opacity-90",
  wine: "bg-wine text-wine-ink hover:opacity-90",
  ghost: "border border-ink text-ink hover:bg-surface",
  quiet: "text-ink hover:bg-surface",
  danger: "bg-danger text-white hover:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "lg" | "sm" }>(
  function Button({ variant = "solid", size = "md", className = "", ...props }, ref) {
    const pad = size === "lg" ? "min-h-14 px-7 text-lg" : size === "sm" ? "min-h-9 px-3.5 text-sm" : "min-h-11 px-5";
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50 ${pad} ${styles[variant]} ${className}`}
        {...props}
      />
    );
  },
);
