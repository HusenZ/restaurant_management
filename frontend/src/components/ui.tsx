"use client";

import { Loader2, Minus, Plus, X } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  forwardRef,
  useEffect,
} from "react";
import { cn, STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import type { Diet, OrderStatus } from "@/lib/types";

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "outline" | "success";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink hover:bg-brand-700 shadow-sm",
  secondary: "bg-brand-50 text-brand-800 hover:bg-brand-100",
  ghost: "text-fg-2 hover:bg-surface-3",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  dark: "bg-inverse text-inverse-fg hover:opacity-90",
  outline: "border border-line bg-surface text-fg-2 hover:bg-surface-2",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-base gap-2 rounded-xl",
  xl: "h-14 px-6 text-base gap-2.5 rounded-2xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
});

/* ---------- Inputs ---------- */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-fg placeholder:text-subtle outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15",
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-fg placeholder:text-subtle outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15",
          className,
        )}
        {...rest}
      />
    );
  },
);

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-fg outline-none focus:border-brand focus:ring-4 focus:ring-brand/15",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

/* ---------- Switch ---------- */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const dims = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "size-4 data-[on=true]:translate-x-4" : "size-5 data-[on=true]:translate-x-5";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full p-0.5 transition disabled:opacity-50",
        dims,
        checked ? "bg-emerald-500" : "bg-line-strong",
      )}
    >
      <span data-on={checked} className={cn("rounded-full bg-white shadow transition-transform", knob)} />
    </button>
  );
}

/* ---------- Badges ---------- */
export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", className)}>
      {children}
    </span>
  );
}

export function StatusPill({ status, label }: { status: OrderStatus; label?: string }) {
  return <Badge className={STATUS_TONE[status]}>{label ?? STATUS_LABEL[status]}</Badge>;
}

export function DietIcon({ diet, className }: { diet: Diet; className?: string }) {
  const color = diet === "non_veg" ? "border-nonveg" : diet === "egg" ? "border-egg" : "border-veg";
  const dot = diet === "non_veg" ? "bg-nonveg" : diet === "egg" ? "bg-egg" : "bg-veg";
  const label = diet === "non_veg" ? "Non-vegetarian" : diet === "egg" ? "Contains egg" : diet === "vegan" ? "Vegan" : "Vegetarian";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-surface", color, className)}
    >
      {diet === "non_veg" ? (
        <span className="size-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-nonveg" />
      ) : (
        <span className={cn("size-2 rounded-full", dot)} />
      )}
    </span>
  );
}

/* ---------- Layout bits ---------- */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-line bg-surface shadow-card", className)}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-subtle", className)} />;
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-muted">
      <Spinner className="size-7 text-brand" />
      {label}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-subtle">{icon}</div>}
      <p className="font-semibold text-fg-2">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-line/70", className)} />;
}

/* ---------- Quantity stepper ---------- */
export function QtyStepper({
  value,
  onChange,
  size = "md",
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: "sm" | "md";
  min?: number;
}) {
  const h = size === "sm" ? "h-8" : "h-9";
  return (
    <div className={cn("inline-flex items-center rounded-lg border border-brand/30 bg-brand-50 text-brand-800", h)}>
      <button type="button" aria-label="Decrease" onClick={() => onChange(Math.max(min, value - 1))} className="flex h-full w-8 items-center justify-center">
        <Minus className="size-4" strokeWidth={2.5} />
      </button>
      <span className="tabular min-w-6 text-center text-sm font-bold" aria-live="polite">{value}</span>
      <button type="button" aria-label="Increase" onClick={() => onChange(Math.min(50, value + 1))} className="flex h-full w-8 items-center justify-center">
        <Plus className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-xl bg-surface-3 p-1 dark:bg-surface-2 dark:ring-1 dark:ring-inset dark:ring-line-soft", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition",
            value === o.value ? "bg-surface text-fg shadow-sm dark:bg-surface-3" : "text-muted hover:text-fg-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Sheet (bottom sheet on mobile, centered dialog on desktop) ---------- */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-zinc-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-3xl bg-surface shadow-sheet sm:animate-pop sm:rounded-3xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        {title !== undefined && (
          <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
            <div className="min-w-0 flex-1 text-lg font-bold text-fg">{title}</div>
            <button onClick={onClose} aria-label="Close" className="-mr-1 rounded-full p-1.5 text-muted hover:bg-surface-3">
              <X className="size-5" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-line-soft bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Side drawer (dashboard detail panels) ---------- */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-zinc-950/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg animate-slide-in flex-col bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0 flex-1">{title}</div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-surface-3">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line-soft px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Animated success check ---------- */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <div className={cn("flex size-20 animate-pop items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30", className)}>
      <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path className="check-path" d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </div>
  );
}
