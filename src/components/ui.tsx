import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover border-transparent",
  secondary: "bg-surface text-foreground border-border hover:bg-slate-50",
  danger: "bg-danger text-white border-transparent hover:opacity-90",
  ghost: "bg-transparent text-primary border-transparent hover:bg-slate-100",
};
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button {...p} className={cx(base, variants[variant], className)} />;
}

export function LinkButton({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...p} className={cx(base, variants[variant], className)} />;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="font-medium">{label}</label>
      {hint && <p id={`${htmlFor}-hint`} className="text-sm text-muted">{hint}</p>}
      {children}
      {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input {...p} className={cx("min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base", className)} />;
}

export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select {...p} className={cx("min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base", className)} />;
}

export function Card({ className, children, ...p }: ComponentProps<"section">) {
  return (
    <section {...p} className={cx("rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6", className)}>
      {children}
    </section>
  );
}

export function Alert({ tone = "info", children, title }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode; title?: string }) {
  const tones = {
    info: "bg-slate-100 text-foreground border-border",
    warn: "bg-warn-bg text-warn-fg border-amber-300",
    danger: "bg-danger-bg text-danger border-red-300",
    ok: "bg-ok-bg text-ok-fg border-green-300",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-lg border p-3 text-sm", tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" }) {
  const t = { neutral: "bg-slate-100 text-slate-800", ok: "bg-ok-bg text-ok-fg", warn: "bg-warn-bg text-warn-fg" };
  return <span className={cx("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", t[tone])}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export const Th = (p: ComponentProps<"th">) => <th scope="col" {...p} className={cx("border-b border-border bg-slate-50 px-3 py-2 font-semibold", p.className)} />;
export const Td = (p: ComponentProps<"td">) => <td {...p} className={cx("border-b border-border px-3 py-2 align-top", p.className)} />;
