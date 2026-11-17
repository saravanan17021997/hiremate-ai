// Title row at the top of each page (also the window drag area on Windows).
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="drag-region flex flex-wrap items-end justify-between gap-4 pb-6 pt-6 sm:pb-8 sm:pt-12">
      <div>
        <h1 className="text-2xl font-semibold sm:text-[28px] leading-tight tracking-tight text-mist">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-haze">{subtitle}</p>}
      </div>
      {actions && <div className="no-drag">{actions}</div>}
    </header>
  );
}
