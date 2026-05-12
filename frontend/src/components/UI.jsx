export function PageTitle({ title, subtitle, action }) {
  return <div className="flex items-start justify-between gap-3">
    <div>
      <h1 className="text-4xl font-bold tracking-tight text-white">{title}</h1>
      {subtitle && <p className="text-slate-400 mt-1">{subtitle}</p>}
    </div>
    {action}
  </div>;
}

export function StatCard({ title, value, tone = "white", children }) {
  const toneClass =
    tone === "sky" ? "text-sky-300"
    : tone === "green" ? "text-emerald-300"
    : tone === "amber" ? "text-amber-300"
    : tone === "red" ? "text-rose-300"
    : "text-white";

  return (
    <div className="panel p-5">
      <p className="text-slate-400 text-xs uppercase tracking-widest">{title}</p>
      {children ?? <p className={`text-4xl font-bold mt-3 ${toneClass}`}>{value}</p>}
    </div>
  );
}

export function KpiCard({
  title,
  value,
  hint,
  icon,
  tone = "sky", // sky | green | amber | red | indigo | violet
  className = "",
}) {
  const toneClass =
    tone === "green" ? "kpi kpi-green"
    : tone === "amber" ? "kpi kpi-amber"
    : tone === "red" ? "kpi kpi-red"
    : tone === "indigo" ? "kpi kpi-indigo"
    : tone === "violet" ? "kpi kpi-violet"
    : "kpi kpi-sky";

  return (
    <div className={`${toneClass} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 dark:text-slate-300/75 uppercase tracking-[.18em]">{title}</p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white truncate">{value}</p>
          {hint && <p className="mt-2 text-xs text-slate-400 dark:text-slate-300/70">{hint}</p>}
        </div>
        {icon && (
          <div className="kpi-icon">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

export function SectionCard({ title, subtitle, right, children, className = "" }) {
  return <section className={`panel p-5 ${className}`}>
    {(title || right) && <div className="flex items-center justify-between mb-3">
      {title ? (
        <div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
      ) : <span />}
      {right}
    </div>}
    {children}
  </section>;
}

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  children,
  className = "",
  variant = "primary",
  size = "md",
  ...props
}) {
  const variantClass =
    variant === "secondary" ? "btn-secondary"
    : variant === "danger" ? "btn-danger"
    : variant === "ghost" ? "btn-ghost"
    : "btn-primary";

  const sizeClass =
    size === "sm" ? "btn-sm"
    : size === "lg" ? "btn-lg"
    : "btn-md";

  return (
    <button className={cx("btn", variantClass, sizeClass, className)} {...props}>
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }) {
  return <input className={cx("field", className)} {...props} />;
}

export function Select({ className = "", ...props }) {
  return <select className={cx("field", className)} {...props} />;
}

export function Badge({ children, className = "", tone = "slate" }) {
  const toneClass =
    tone === "green" ? "badge badge-green"
    : tone === "red" ? "badge badge-red"
    : tone === "amber" ? "badge badge-amber"
    : tone === "sky" ? "badge badge-sky"
    : tone === "indigo" ? "badge badge-indigo"
    : "badge badge-slate";
  return <span className={cx(toneClass, className)}>{children}</span>;
}

export function Table({ className = "", ...props }) {
  return <table className={cx("table", className)} {...props} />;
}

export function Loading() { return <div className="animate-pulse text-slate-300">Loading...</div>; }
export function ErrorState({text}) { return <div className="text-rose-300">{text}</div>; }
