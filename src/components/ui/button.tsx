import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none",
    "transition-[opacity,transform,background-color,border-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
    "disabled:pointer-events-none disabled:opacity-40 aria-busy:pointer-events-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "active:not-disabled:scale-[0.97]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg shadow-[var(--shadow-xs)] hover:opacity-90",
        secondary: "border border-border bg-bg-elevated text-fg hover:border-border-strong hover:bg-bg-subtle",
        ghost: "text-fg hover:bg-fg/10",
        danger: "bg-heart text-white shadow-[var(--shadow-xs)] hover:opacity-90",
      },
      size: {
        // 44px touch target on phones, compact on desktop.
        sm: "h-11 rounded-md px-3 text-sm md:h-9",
        md: "h-11 rounded-lg px-4 text-sm",
        lg: "h-12 rounded-xl px-5 text-base",
        icon: "size-11 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

/**
 * Button. `loading` shows a spinner, marks the button busy and disables it
 * (the label stays, so the width doesn't jump).
 */
export function Button({
  className,
  variant,
  size,
  asChild,
  loading = false,
  disabled,
  children,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean }) {
  const cls = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot className={cls} aria-busy={loading || undefined} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
