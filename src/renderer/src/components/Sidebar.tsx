// Collapsible left navigation. The collapsed choice is remembered on this PC.
import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { NAV } from "../lib/nav";
import { Logo } from "./Logo";

type Props = { collapsed: boolean; onToggle: () => void };

export function Sidebar({ collapsed, onToggle }: Props) {
  const [version, setVersion] = useState("");
  useEffect(() => {
    void window.hiremate.app.getInfo().then((r) => r.ok && setVersion(r.data.version));
  }, []);
  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 248 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="relative z-10 flex h-full shrink-0 flex-col border-r border-white/[0.06] bg-navy-950/60 backdrop-blur-xl"
    >
      <div className="drag-region flex h-16 items-center gap-3 px-5 pt-2">
        <Logo />
        {!collapsed && <span className="text-[15px] font-semibold tracking-tight text-mist">HireMate AI</span>}
      </div>

      <nav aria-label="Main" className="no-drag mt-4 flex flex-1 flex-col gap-1 px-3">
        {NAV.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                isActive ? "text-mist" : "text-haze hover:bg-white/[0.04] hover:text-mist"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl border border-electric/25 bg-gradient-to-r from-electric/20 to-violet/10"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                )}
                <Icon className={`relative h-[18px] w-[18px] shrink-0 ${isActive ? "text-electric-soft" : ""}`} strokeWidth={1.8} />
                {!collapsed && <span className="relative truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="no-drag m-3 flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-dim transition-colors hover:bg-white/[0.04] hover:text-haze"
      >
        {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        {!collapsed && <span>Collapse</span>}
        {!collapsed && version && <span className="ml-auto text-xs text-dim" title="HireMate AI version">v{version}</span>}
      </button>
    </motion.aside>
  );
}
