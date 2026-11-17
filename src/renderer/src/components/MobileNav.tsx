// Phones and narrow windows: the sections as a bottom bar (the sidebar is hidden there).
import { NavLink } from "react-router-dom";
import { APP_NAME, CREDIT } from "@shared/brand";
import { navFor } from "../lib/nav";
import { Logo } from "./Logo";

export function MobileNav() {
  const items = navFor(window.hiremate.platform);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.08] bg-navy-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="flex overflow-x-auto px-1">
        {items.map(({ path, label, short, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) => `flex min-w-[64px] flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[11px] ${isActive ? "text-electric-soft" : "text-haze"}`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.8} />
            <span className="whitespace-nowrap">{short ?? label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Phones: the app name at the top of each page (the sidebar that normally shows it is hidden). */
export function MobileTitle() {
  return (
    <div className="flex items-center gap-2.5 pt-4 md:hidden">
      <Logo size={26} />
      <span className="text-sm font-semibold text-mist">{APP_NAME}</span>
      <span className="ml-auto text-[11px] text-dim">{CREDIT}</span>
    </div>
  );
}
